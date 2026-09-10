import 'package:flutter/material.dart';

import 'app.dart';
import 'core/services/connectivity_service.dart';
import 'core/services/offline_sync_service.dart';
import 'core/services/push_notification_service.dart';
import 'core/services/theme_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await ThemeService.instance.init();
  await ConnectivityService.instance.init();
  await PushNotificationService.instance.init();
  ConnectivityService.instance.addListener(() {
    if (ConnectivityService.instance.isOnline) {
      OfflineSyncService.instance.flush();
    }
  });
  runApp(const DtsMobileApp());
}
