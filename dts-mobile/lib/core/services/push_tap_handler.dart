import 'package:flutter/material.dart';

import '../app_navigator.dart';
import '../models/task.dart';
import '../../features/home/home_screen.dart';
import '../../features/service/task_details_screen.dart';
import 'assigned_inbox_service.dart';
import 'auth_service.dart';
import 'push_notification_service.dart';
import 'task_service.dart';

void _goNamedAndClear(String routeName) {
  navigatorKey.currentState?.pushNamedAndRemoveUntil(routeName, (route) => false);
}

/// Обробка кліку по push: перевірка токена, інакше логін, потім заявка з повідомлення.
Future<void> handleNotificationTap(Map<String, dynamic> data) async {
  await PushNotificationService.instance.rememberPending(data);

  final sessionOk = AuthService.instance.isAuthenticated &&
      await AuthService.instance.validateSession();
  if (!sessionOk) {
    await AuthService.instance.expireSession();
    _goNamedAndClear('/login');
    return;
  }

  await openTaskFromPushData(data);
}

Future<void> openTaskFromPushData(Map<String, dynamic> data) async {
  final taskId = data['taskId']?.toString() ?? '';
  if (taskId.isEmpty) {
    await PushNotificationService.instance.clearPending();
    _goNamedAndClear(HomeScreen.routeName);
    return;
  }

  try {
    await AssignedInboxService.instance.ingestPush(data);
    if (data['type']?.toString() == 'task_unassigned') {
      await PushNotificationService.instance.clearPending();
      _goNamedAndClear(HomeScreen.routeName);
      return;
    }
    final taskData = await TaskService.instance.fetchTask(taskId);
    final task = Task.fromJson(taskData);
    await AssignedInboxService.instance.upsertMap(taskData);
    await PushNotificationService.instance.clearPending();
    final nav = navigatorKey.currentState;
    if (nav == null) return;
    nav.pushNamedAndRemoveUntil(HomeScreen.routeName, (route) => false);
    nav.push(
      MaterialPageRoute(
        builder: (_) => TaskDetailsScreen(task: task),
      ),
    );
  } catch (_) {
    await PushNotificationService.instance.clearPending();
    _goNamedAndClear(HomeScreen.routeName);
  }
}
