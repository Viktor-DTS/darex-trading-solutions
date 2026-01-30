import 'package:flutter/material.dart';

import '../../core/services/auth_service.dart';
import '../auth/login_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  static const routeName = '/home';

  @override
  Widget build(BuildContext context) {
    final user = AuthService.instance;
    final modules = _availableModules(user.role ?? '');

    return Scaffold(
      appBar: AppBar(
        title: const Text('DTS Mobile'),
        actions: [
          IconButton(
            onPressed: () async {
              await AuthService.instance.logout();
              if (!context.mounted) return;
              Navigator.of(context).pushReplacementNamed(LoginScreen.routeName);
            },
            icon: const Icon(Icons.logout),
            tooltip: 'Вийти',
          ),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Вітаємо, ${user.userName ?? 'користувач'}',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              if (user.region != null && user.region!.isNotEmpty)
                Text(
                  'Регіон: ${user.region}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              const SizedBox(height: 16),
              Expanded(
                child: modules.isEmpty
                    ? Center(
                        child: Text(
                          'Немає доступних модулів для ролі: ${user.role ?? ''}',
                          textAlign: TextAlign.center,
                        ),
                      )
                    : GridView.count(
                        crossAxisCount: 2,
                        mainAxisSpacing: 12,
                        crossAxisSpacing: 12,
                        childAspectRatio: 1.1,
                        children: modules
                            .map((module) => _ModuleTile(
                                  title: module.title,
                                  icon: module.icon,
                                  routeName: module.routeName,
                                ))
                            .toList(),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Module {
  const _Module({
    required this.title,
    required this.icon,
    required this.allowedRoles,
    required this.routeName,
  });

  final String title;
  final IconData icon;
  final Set<String> allowedRoles;
  final String routeName;
}

List<_Module> _availableModules(String role) {
  const adminRoles = {'admin', 'administrator'};
  const modules = [
    _Module(
      title: 'Сервісна служба',
      icon: Icons.engineering,
      allowedRoles: {'service', 'engineer', 'technician'},
      routeName: '/service/tasks',
    ),
    _Module(
      title: 'Оператор',
      icon: Icons.headset_mic,
      allowedRoles: {'operator', 'dispatcher'},
      routeName: '/operator',
    ),
    _Module(
      title: 'Складський облік',
      icon: Icons.warehouse,
      allowedRoles: {'warehouse', 'zavsklad'},
      routeName: '/warehouse',
    ),
    _Module(
      title: 'Відділ тестування',
      icon: Icons.science,
      allowedRoles: {'testing', 'tester'},
      routeName: '/testing',
    ),
    _Module(
      title: 'Менеджери',
      icon: Icons.dashboard_customize,
      allowedRoles: {'manager', 'regional_manager', 'director'},
      routeName: '/managers',
    ),
  ];

  if (adminRoles.contains(role)) {
    return modules;
  }

  return modules.where((module) => module.allowedRoles.contains(role)).toList();
}

class _ModuleTile extends StatelessWidget {
  const _ModuleTile({
    required this.title,
    required this.icon,
    required this.routeName,
  });

  final String title;
  final IconData icon;
  final String routeName;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () {
        Navigator.of(context).pushNamed(routeName);
      },
      borderRadius: BorderRadius.circular(16),
      child: Ink(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 34),
            const SizedBox(height: 8),
            Text(
              title,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleSmall,
            ),
          ],
        ),
      ),
    );
  }
}
