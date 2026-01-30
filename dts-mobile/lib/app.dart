import 'package:flutter/material.dart';

import 'core/services/auth_service.dart';
import 'features/auth/login_screen.dart';
import 'features/home/home_screen.dart';
import 'features/managers/managers_overview_screen.dart';
import 'features/operator/operator_create_task_screen.dart';
import 'features/service/service_tasks_screen.dart';
import 'features/testing/testing_requests_screen.dart';
import 'features/warehouse/warehouse_screen.dart';

class DtsMobileApp extends StatelessWidget {
  const DtsMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'DTS Mobile',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF3B82F6)),
        useMaterial3: true,
      ),
      routes: {
        LoginScreen.routeName: (_) => const LoginScreen(),
        HomeScreen.routeName: (_) => const HomeScreen(),
        ServiceTasksScreen.routeName: (_) => const ServiceTasksScreen(),
        OperatorCreateTaskScreen.routeName: (_) =>
            const OperatorCreateTaskScreen(),
        WarehouseScreen.routeName: (_) => const WarehouseScreen(),
        TestingRequestsScreen.routeName: (_) => const TestingRequestsScreen(),
        ManagersOverviewScreen.routeName: (_) =>
            const ManagersOverviewScreen(),
      },
      home: const AuthGate(),
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

  @override
  void initState() {
    super.initState();
    _initFuture = AuthService.instance.init();
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

        if (AuthService.instance.isAuthenticated) {
          return const HomeScreen();
        }

        return const LoginScreen();
      },
    );
  }
}
