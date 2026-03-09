import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
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

class PushNotificationService {
  PushNotificationService._internal();

  static final PushNotificationService instance = PushNotificationService._internal();

  bool _initialized = false;

  /// Callback при кліку на сповіщення (коли додаток відкрито з background/terminated).
  /// data може містити taskId, type тощо для deep link.
  void Function(Map<String, dynamic> data)? onNotificationTapped;

  Map<String, dynamic>? _pendingInitialData;

  Future<void> init() async {
    if (_initialized) return;

    try {
      await Firebase.initializeApp();
    } catch (_) {
      // Firebase не налаштовано (немає google-services.json) — пропускаємо push
      return;
    }

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
      return;
    }

    // Сповіщення у foreground — показуємо локально або ігноруємо (бекенд вже показує в tray)
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

    _initialized = true;

    // Якщо вже залогінений — одразу надсилаємо токен
    if (Session.token != null && Session.token!.isNotEmpty) {
      await _sendCurrentToken();
    }
  }

  void _onForegroundMessage(RemoteMessage message) {
    // У foreground FCM не показує notification automatically.
    // Можна показати in-app banner або покластися на системний tray
    // (залежить від того, як бекенд відправляє — notification vs data-only).
    // Поки що нічого не робимо, щоб не дублювати.
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
