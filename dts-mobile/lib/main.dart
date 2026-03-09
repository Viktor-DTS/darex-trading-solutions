import 'package:flutter/material.dart';

import 'app.dart';
import 'core/services/push_notification_service.dart';
import 'core/services/theme_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await ThemeService.instance.init();
  await PushNotificationService.instance.init();
  runApp(const DtsMobileApp());
}
