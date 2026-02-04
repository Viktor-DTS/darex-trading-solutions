import 'dart:convert';
import 'dart:io';

import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config.dart';

/// Результат перевірки оновлення: чи потрібне оновлення, чи обов'язкове, посилання на магазин.
class AppUpdateResult {
  final bool needsUpdate;
  final bool forceUpdate;
  final String? storeUrl;
  final String latestVersion;
  final String currentVersion;

  AppUpdateResult({
    required this.needsUpdate,
    required this.forceUpdate,
    this.storeUrl,
    required this.latestVersion,
    required this.currentVersion,
  });
}

/// Порівняння версій у форматі "a.b.c" (наприклад 0.1.0).
/// Повертає: < 0 якщо current < other, 0 якщо рівні, > 0 якщо current > other.
int _compareVersions(String current, String other) {
  final c = _parseVersion(current);
  final o = _parseVersion(other);
  for (int i = 0; i < 3; i++) {
    final diff = (c[i] - o[i]);
    if (diff != 0) return diff;
  }
  return 0;
}

List<int> _parseVersion(String v) {
  final parts = v.split('.').map((e) => int.tryParse(e.trim()) ?? 0).toList();
  while (parts.length < 3) parts.add(0);
  return parts.take(3).toList();
}

/// Сервіс перевірки оновлень: при вході додаток викликає checkForUpdate(),
/// отримує інфо з бекенду і повертає результат для показу діалогу.
class AppUpdateService {
  AppUpdateService._();
  static final AppUpdateService instance = AppUpdateService._();

  /// Перевіряє, чи є нова версія. Викликати при старті (наприклад після AuthService.init).
  /// Повертає [AppUpdateResult] якщо потрібно показати оновлення, інакше null.
  Future<AppUpdateResult?> checkForUpdate() async {
    try {
      final packageInfo = await PackageInfo.fromPlatform();
      final currentVersion = packageInfo.version;

      final uri = Uri.parse('${AppConfig.apiBaseUrl}/api/app-version');
      final client = HttpClient();
      client.connectionTimeout = const Duration(seconds: 5);
      final request = await client.getUrl(uri);
      final response = await request.close();
      if (response.statusCode != 200) return null;

      final body = await response.transform(utf8.decoder).join();
      client.close();

      // Парсимо JSON вручну, щоб не додавати dependency
      final latestVersion = _jsonString(body, 'latest_version') ?? currentVersion;
      final minVersion = _jsonString(body, 'min_version') ?? currentVersion;
      final forceUpdate = _jsonBool(body, 'force_update');
      String? storeUrl;
      if (Platform.isAndroid) {
        storeUrl = _jsonString(body, 'android_store_url');
      } else if (Platform.isIOS) {
        storeUrl = _jsonString(body, 'ios_store_url');
      }
      storeUrl ??= _jsonString(body, 'android_store_url');

      final needsUpdate = _compareVersions(currentVersion, latestVersion) < 0;
      final mustUpdate = forceUpdate && _compareVersions(currentVersion, minVersion) < 0;

      if (needsUpdate || mustUpdate) {
        return AppUpdateResult(
          needsUpdate: true,
          forceUpdate: mustUpdate,
          storeUrl: storeUrl,
          latestVersion: latestVersion,
          currentVersion: currentVersion,
        );
      }
    } catch (_) {
      // Мережа/парсинг — ігноруємо, не блокуємо вхід
    }
    return null;
  }

  static String? _jsonString(String json, String key) {
    final pattern = RegExp('"$key"\\s*:\\s*"([^"]*)"');
    final match = pattern.firstMatch(json);
    return match?.group(1);
  }

  static bool _jsonBool(String json, String key) {
    final quoted = RegExp('"$key"\\s*:\\s*"true"').firstMatch(json);
    if (quoted != null) return true;
    final unquoted = RegExp('"$key"\\s*:\\s*true').firstMatch(json);
    return unquoted != null;
  }

  /// Відкриває посилання на магазин (Play / App Store).
  Future<bool> openStore(String? storeUrl) async {
    if (storeUrl == null || storeUrl.isEmpty) return false;
    final uri = Uri.parse(storeUrl);
    return launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}
