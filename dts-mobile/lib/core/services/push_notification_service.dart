import 'dart:async';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:permission_handler/permission_handler.dart';

import 'api_client.dart';
import '../session.dart';

/// Сервіс push-сповіщень через Firebase Cloud Messaging.
/// Токен надсилається на бекенд після логіну.
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  // Фонові повідомлення — можна логувати або обробити окремо
}

const _androidChannelId = 'dts_push';
const _androidChannelName = 'DTS сповіщення';
const _androidChannelDescription = 'Заявки та події сервісу';

class PushNotificationService {
  PushNotificationService._internal();

  static final PushNotificationService instance = PushNotificationService._internal();

  bool _initialized = false;
  bool _fcmReady = false;

  final FlutterLocalNotificationsPlugin _local = FlutterLocalNotificationsPlugin();

  /// Callback при кліку на сповіщення (коли додаток відкрито з background/terminated).
  /// data може містити taskId, type тощо для deep link.
  void Function(Map<String, dynamic> data)? onNotificationTapped;

  Map<String, dynamic>? _pendingInitialData;

  int _localNotificationId = 0;

  Future<void> init() async {
    if (_initialized) return;

    await _initLocalNotifications();

    try {
      await Firebase.initializeApp();
    } catch (_) {
      // Firebase не налаштовано (немає google-services.json) — локальні тести все одно доступні
      _initialized = true;
      return;
    }

    _fcmReady = true;

    // Обробник фонових повідомлень
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

    // Дозвіл на сповіщення — Android 13+ потребує runtime-запит
    if (Platform.isAndroid) {
      await Permission.notification.request();
    }

    // Дозволи (iOS)
    final settings = await FirebaseMessaging.instance.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    if (settings.authorizationStatus == AuthorizationStatus.denied) {
      _initialized = true;
      return;
    }

    // У foreground показуємо розгорнуте локальне сповіщення (як розгортання в Telegram)
    FirebaseMessaging.onMessage.listen(_onForegroundMessage);

    // Клік по сповіщенню, коли додаток у background
    FirebaseMessaging.onMessageOpenedApp.listen(_onMessageOpenedApp);

    // Клік по сповіщенню, коли додаток був terminated (callback встановлять пізніше)
    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null && initial.data.isNotEmpty) {
      _pendingInitialData = Map<String, String>.from(initial.data);
    }

    // Відстеження оновлення токену
    FirebaseMessaging.instance.onTokenRefresh.listen(_sendTokenToBackend);

    // Якщо вже залогінений — одразу надсилаємо токен
    if (Session.token != null && Session.token!.isNotEmpty) {
      await _sendCurrentToken();
    }

    _initialized = true;
  }

  Future<void> _initLocalNotifications() async {
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const darwinInit = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    const initSettings = InitializationSettings(android: androidInit, iOS: darwinInit, macOS: darwinInit);

    await _local.initialize(
      settings: initSettings,
      onDidReceiveNotificationResponse: (details) {
        final payload = details.payload;
        if (payload == null || payload.isEmpty) return;
        // Мінімальна передача data через payload — для FCM data краще зберігати окремо;
        // тестове сповіщення без deep link.
      },
    );

    if (Platform.isAndroid) {
      final android = _local.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      await android?.createNotificationChannel(
        const AndroidNotificationChannel(
          _androidChannelId,
          _androidChannelName,
          description: _androidChannelDescription,
          importance: Importance.high,
        ),
      );
    }
  }

  void _onForegroundMessage(RemoteMessage message) {
    unawaited(_showFcmAsExpandedLocal(message));
  }

  /// Показує FCM у foreground як «розгорнуте» сповіщення (Big Text на Android).
  Future<void> _showFcmAsExpandedLocal(RemoteMessage message) async {
    final data = message.data;
    final n = message.notification;

    final title = _stringFrom(data, const ['title', 'headline']) ?? n?.title ?? 'DTS';
    final expanded = _expandedBodyFromPayload(data, n?.title, n?.body);
    final summary = _summaryLine(data, n?.body) ?? (expanded.length > 80 ? '${expanded.substring(0, 77)}…' : expanded);

    await _showExpandedLocal(
      title: title,
      summary: summary.isNotEmpty ? summary : title,
      expandedBody: expanded,
    );
  }

  static String? _stringFrom(Map<String, dynamic> data, List<String> keys) {
    for (final k in keys) {
      final v = data[k];
      if (v != null && v.toString().trim().isNotEmpty) return v.toString().trim();
    }
    return null;
  }

  /// Повний текст для розгортання: `expandedBody` / `bigText` з data або збірка полів як у Telegram-бота.
  static String _expandedBodyFromPayload(
    Map<String, dynamic> data,
    String? notificationTitle,
    String? notificationBody,
  ) {
    final direct = _stringFrom(data, const ['expandedBody', 'bigText', 'body', 'message']);
    if (direct != null && direct.contains('\n')) return direct;
    if (direct != null && direct.length > 120) return direct;

    final lines = <String>[];
    void addLine(String emoji, String label, String key, [List<String>? altKeys]) {
      final keys = <String>[key, ...?altKeys];
      final v = _stringFrom(data, keys);
      if (v != null) lines.add('$emoji $label: $v');
    }

    addLine('📄', 'Номер', 'taskNumber', ['number', 'task_number']);
    addLine('👤', 'Створив', 'createdBy', ['created_by', 'author', 'createdByName']);
    addLine('📊', 'Статус', 'status', ['taskStatus', 'task_status']);
    addLine('📅', 'Дата', 'taskDate', ['date', 'task_date']);
    addLine('📍', 'Регіон', 'region');
    addLine('👥', 'Замовник', 'customer', ['customerName', 'client', 'company']);
    addLine('🏠', 'Адреса', 'address');
    addLine('⚙️', 'Обладнання', 'equipment', ['equipmentModel', 'model']);

    final action = _stringFrom(data, const ['actionHint', 'action', 'action_hint', 'hint']);
    if (action != null) {
      lines.add('');
      lines.add('💡 Дія: $action');
    }

    if (lines.isNotEmpty) {
      final header = notificationTitle ?? _stringFrom(data, const ['header', 'typeTitle']) ?? '';
      final buf = StringBuffer();
      if (header.isNotEmpty) {
        buf.writeln(header);
        buf.writeln();
      }
      buf.writeAll(lines, '\n');
      return buf.toString().trim();
    }

    if (direct != null) return direct;
    final single = notificationBody ?? '';
    return single.isNotEmpty ? single : 'Нове повідомлення DTS';
  }

  static String? _summaryLine(Map<String, dynamic> data, String? notificationBody) {
    final num_ = _stringFrom(data, const ['taskNumber', 'number', 'task_number']);
    final region = _stringFrom(data, const ['region']);
    if (num_ != null && region != null) return '$num_ · $region';
    if (num_ != null) return num_;
    if (notificationBody != null && notificationBody.isNotEmpty) return notificationBody;
    return null;
  }

  /// Демо-сповіщення у стилі Telegram-бота (розгорніть шторку / натисніть на сповіщення).
  Future<void> showTestExpandedNotification() async {
    if (Platform.isAndroid) {
      await Permission.notification.request();
    }

    const title = '🔔🆕 Нова заявка (тест)';
    const expanded = '''
📄 Номер: DP-0001500
👤 Створив: Корж Анастасія
📊 Статус: Заявка
📅 Дата: 2026-03-24
📍 Регіон: Дніпровський
👥 Замовник: ТОВ «ЮГОЙЛ»
🏠 Адреса: вул. Соборна 104, м. Баштанка
⚙️ Обладнання: DE70BDS

💡 Дія: Розглянути та призначити виконавця''';

    await _showExpandedLocal(
      title: title,
      summary: 'DP-0001500 · Дніпровський · ТОВ «ЮГОЙЛ»',
      expandedBody: expanded.trim(),
    );
  }

  Future<void> _showExpandedLocal({
    required String title,
    required String summary,
    required String expandedBody,
  }) async {
    final id = _localNotificationId = (_localNotificationId + 1) % 0x7fffffff;

    final androidDetails = AndroidNotificationDetails(
      _androidChannelId,
      _androidChannelName,
      channelDescription: _androidChannelDescription,
      importance: Importance.high,
      priority: Priority.high,
      styleInformation: BigTextStyleInformation(
        expandedBody,
        contentTitle: title,
        summaryText: summary,
      ),
    );

    const darwinDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );

    // Android: згорнуто — короткий рядок; розгортання дає BigTextStyleInformation.
    // iOS: у списку видно багаторядковий body після розгортання.
    final collapsedBody = Platform.isIOS || Platform.isMacOS ? expandedBody : summary;

    await _local.show(
      id: id,
      title: title,
      body: collapsedBody,
      notificationDetails: NotificationDetails(
        android: androidDetails,
        iOS: darwinDetails,
        macOS: darwinDetails,
      ),
    );
  }

  void _onMessageOpenedApp(RemoteMessage message) {
    _handleMessageData(message.data);
  }

  void _handleMessageData(Map<String, dynamic> data) {
    final map = Map<String, String>.from(data);
    if (onNotificationTapped != null) {
      onNotificationTapped!(map);
    } else {
      _pendingInitialData = map;
    }
  }

  /// Викликати після першого build — обробить pending message з getInitialMessage.
  void handlePendingTap() {
    if (_pendingInitialData != null && onNotificationTapped != null) {
      onNotificationTapped!(_pendingInitialData!);
      _pendingInitialData = null;
    }
  }

  Future<void> _sendCurrentToken() async {
    if (!_fcmReady) return;
    final token = await FirebaseMessaging.instance.getToken();
    if (token == null || token.isEmpty) return;

    await _sendTokenToBackend(token);
  }

  Future<void> _sendTokenToBackend(String token) async {
    if (Session.token == null || Session.token!.isEmpty) return;

    try {
      await ApiClient.instance.dio.post(
        '/api/users/me/fcm-token',
        data: {'fcmToken': token},
      );
    } catch (_) {
      // Тиха помилка — можливо офлайн або ендпоінт ще не реалізований
    }
  }

  /// Викликати після успішного логіну.
  Future<void> refreshToken() async {
    if (!_initialized) return;
    await _sendCurrentToken();
  }

  /// Викликати при логауті — на бекенді можна очистити токен.
  Future<void> clearToken() async {
    if (Session.token == null) return;
    try {
      await ApiClient.instance.dio.delete('/api/users/me/fcm-token');
    } catch (_) {}
  }
}
