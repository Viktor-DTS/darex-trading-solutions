import 'package:flutter/material.dart';

import 'core/app_navigator.dart';
import 'core/services/app_update_service.dart';
import 'core/services/auth_service.dart';
import 'core/services/connectivity_service.dart';
import 'core/services/offline_sync_service.dart';
import 'core/services/push_notification_service.dart';
import 'core/services/push_tap_handler.dart';
import 'core/services/theme_service.dart';
import 'core/widgets/offline_banner.dart';
import 'core/widgets/update_dialog.dart';
import 'features/auth/login_screen.dart';
import 'features/home/home_screen.dart';
import 'features/managers/managers_overview_screen.dart';
import 'features/operator/operator_create_task_screen.dart';
import 'features/service/service_tasks_screen.dart';
import 'features/settings/about_screen.dart';
import 'features/testing/testing_requests_screen.dart';
import 'features/warehouse/quick_unload_screen.dart';
import 'features/warehouse/qr_scanner_screen.dart';
import 'features/warehouse/warehouse_screen.dart';

class DtsMobileApp extends StatelessWidget {
  const DtsMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: ThemeService.instance,
      builder: (_, __) {
        return MaterialApp(
          navigatorKey: navigatorKey,
          title: 'DTS Mobile',
          theme: ThemeData(
            colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF3B82F6)),
            useMaterial3: true,
          ),
          darkTheme: ThemeData(
            colorScheme: ColorScheme.fromSeed(
              seedColor: const Color(0xFF3B82F6),
              brightness: Brightness.dark,
            ),
            useMaterial3: true,
          ),
          themeMode: ThemeService.instance.themeMode,
          builder: (context, child) {
            return ListenableBuilder(
              listenable: ConnectivityService.instance,
              builder: (_, __) {
                return Column(
                  children: [
                    if (ConnectivityService.instance.isOffline) const OfflineModeBanner(),
                    Expanded(child: child ?? const SizedBox.shrink()),
                  ],
                );
              },
            );
          },
          routes: {
        LoginScreen.routeName: (_) => const LoginScreen(),
        HomeScreen.routeName: (_) => const HomeScreen(),
        ServiceTasksScreen.routeName: (_) => const ServiceTasksScreen(),
        OperatorCreateTaskScreen.routeName: (_) =>
            const OperatorCreateTaskScreen(),
        WarehouseScreen.routeName: (_) => const WarehouseScreen(),
        QrScannerScreen.routeName: (_) => const QrScannerScreen(),
        QuickUnloadScreen.routeName: (_) => const QuickUnloadScreen(),
        TestingRequestsScreen.routeName: (_) => const TestingRequestsScreen(),
        AboutScreen.routeName: (_) => const AboutScreen(),
        ManagersOverviewScreen.routeName: (_) =>
            const ManagersOverviewScreen(),
      },
      home: const AuthGate(),
        );
      },
    );
  }
}

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  late Future<void> _initFuture;
  bool _updateCheckDone = false;

  @override
  void initState() {
    super.initState();
    _initFuture = AuthService.instance.init();
    _setupPushTapHandler();
    ConnectivityService.instance.addListener(_onConnectivityChanged);
  }

  @override
  void dispose() {
    ConnectivityService.instance.removeListener(_onConnectivityChanged);
    super.dispose();
  }

  void _onConnectivityChanged() {
    if (ConnectivityService.instance.isOnline) {
      OfflineSyncService.instance.flush();
    }
  }

  void _setupPushTapHandler() {
    PushNotificationService.instance.onNotificationTapped = handleNotificationTap;
  }

  Future<void> _checkUpdateAndShowDialog(BuildContext context) async {
    if (_updateCheckDone || !context.mounted) return;
    _updateCheckDone = true;
    final result = await AppUpdateService.instance.checkForUpdate();
    if (!context.mounted || result == null) return;
    await showAppUpdateDialog(context, result);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<void>(
      future: _initFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        // Після входу перевіряємо оновлення один раз і показуємо діалог при потребі
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!AuthService.instance.isAuthenticated) return;
          _checkUpdateAndShowDialog(context);
          PushNotificationService.instance.handlePendingTap();
        });

        if (AuthService.instance.isAuthenticated) {
          return const HomeScreen();
        }

        return const LoginScreen();
      },
    );
  }
}
