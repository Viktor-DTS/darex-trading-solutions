import 'dart:io';

import 'package:dio/dio.dart';
import 'package:open_filex/open_filex.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config.dart';

class AppUpdateResult {
  final bool needsUpdate;
  final bool forceUpdate;
  final String? storeUrl;
  final String? downloadUrl;
  final String latestVersion;
  final String currentVersion;
  final String changelog;
  final int fileSize;

  AppUpdateResult({
    required this.needsUpdate,
    required this.forceUpdate,
    this.storeUrl,
    this.downloadUrl,
    required this.latestVersion,
    required this.currentVersion,
    this.changelog = '',
    this.fileSize = 0,
  });

  String get apkUrl {
    final direct = (downloadUrl ?? '').trim();
    if (direct.isNotEmpty && !direct.contains('play.google.com')) return direct;
    return (storeUrl ?? '').trim();
  }
}

int _compareVersions(String current, String other) {
  final c = _parseVersion(current);
  final o = _parseVersion(other);
  for (int i = 0; i < 3; i++) {
    final diff = c[i] - o[i];
    if (diff != 0) return diff;
  }
  return 0;
}

List<int> _parseVersion(String v) {
  final parts = v.split('.').map((e) => int.tryParse(e.trim()) ?? 0).toList();
  while (parts.length < 3) {
    parts.add(0);
  }
  return parts.take(3).toList();
}

class AppUpdateService {
  AppUpdateService._();
  static final AppUpdateService instance = AppUpdateService._();

  final Dio _dio = Dio(BaseOptions(
    connectTimeout: const Duration(seconds: 20),
    receiveTimeout: const Duration(minutes: 5),
  ));

  Future<AppUpdateResult?> checkForUpdate() async {
    try {
      final packageInfo = await PackageInfo.fromPlatform();
      final currentVersion = packageInfo.version;

      final res = await _dio.get('${AppConfig.apiBaseUrl}/api/app-version');
      if (res.statusCode != 200 || res.data is! Map) return null;
      final data = Map<String, dynamic>.from(res.data as Map);

      final latestVersion = data['latest_version']?.toString() ?? currentVersion;
      final minVersion = data['min_version']?.toString() ?? currentVersion;
      final forceUpdate = data['force_update'] == true || data['force_update'] == 'true';
      final storeUrl = Platform.isIOS
          ? data['ios_store_url']?.toString()
          : (data['android_store_url']?.toString() ?? '');
      final downloadUrl = data['download_url']?.toString() ?? storeUrl;
      final changelog = data['changelog']?.toString() ?? '';
      final fileSize = int.tryParse('${data['file_size'] ?? 0}') ?? 0;

      final needsUpdate = _compareVersions(currentVersion, latestVersion) < 0;
      final mustUpdate = forceUpdate && _compareVersions(currentVersion, minVersion) < 0;

      if (needsUpdate || mustUpdate) {
        return AppUpdateResult(
          needsUpdate: true,
          forceUpdate: mustUpdate,
          storeUrl: storeUrl,
          downloadUrl: downloadUrl,
          latestVersion: latestVersion,
          currentVersion: currentVersion,
          changelog: changelog,
          fileSize: fileSize,
        );
      }
    } catch (_) {
      // Мережа — не блокуємо вхід
    }
    return null;
  }

  Future<void> downloadAndInstall(
    AppUpdateResult result, {
    void Function(double progress)? onProgress,
  }) async {
    final url = result.apkUrl;
    if (url.isEmpty) {
      throw Exception('Немає посилання на APK');
    }
    if (!Platform.isAndroid) {
      await openStore(url);
      return;
    }

    if (await Permission.requestInstallPackages.isDenied) {
      await Permission.requestInstallPackages.request();
    }

    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/dts-mobile-${result.latestVersion}.apk');
    await _dio.download(
      url,
      file.path,
      onReceiveProgress: (received, total) {
        if (total > 0) onProgress?.call(received / total);
      },
    );

    final opened = await OpenFilex.open(
      file.path,
      type: 'application/vnd.android.package-archive',
    );
    if (opened.type != ResultType.done) {
      await openStore(url);
    }
  }

  Future<bool> openStore(String? storeUrl) async {
    if (storeUrl == null || storeUrl.isEmpty) return false;
    final uri = Uri.parse(storeUrl);
    return launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}
