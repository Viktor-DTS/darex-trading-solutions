import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../../core/services/app_update_service.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/theme_service.dart';
import '../auth/login_screen.dart';
import '../settings/about_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  static const routeName = '/home';

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  String _version = '';

  @override
  void initState() {
    super.initState();
    PackageInfo.fromPlatform().then((info) {
      if (mounted) setState(() => _version = info.version);
    });
  }

  void _showUpdateDialog(BuildContext context, AppUpdateResult result) {
    showDialog(
      context: context,
      barrierDismissible: !result.forceUpdate,
      builder: (ctx) => AlertDialog(
        title: const Text('Є оновлення'),
        content: Text(
          result.forceUpdate
              ? 'Для роботи потрібна нова версія (${result.latestVersion}). У вас ${result.currentVersion}.'
              : 'Доступна версія ${result.latestVersion} (у вас ${result.currentVersion}).',
        ),
        actions: [
          if (!result.forceUpdate)
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Пізніше'),
            ),
          FilledButton(
            onPressed: () async {
              Navigator.pop(ctx);
              await AppUpdateService.instance.openStore(result.storeUrl);
            },
            child: const Text('Оновити'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final user = AuthService.instance;
    final modules = _availableModules(user.role ?? '');

    return Scaffold(
      appBar: AppBar(
        title: GestureDetector(
          onLongPress: () => Navigator.of(context).pushNamed(AboutScreen.routeName),
          child: const Text('DTS Mobile'),
        ),
        actions: [
          IconButton(
            onPressed: () async {
              final current = ThemeService.instance.themeMode;
              final next = switch (current) {
                ThemeMode.light => ThemeMode.dark,
                ThemeMode.dark => ThemeMode.system,
                ThemeMode.system => ThemeMode.light,
              };
              await ThemeService.instance.setThemeMode(next);
            },
            icon: ListenableBuilder(
              listenable: ThemeService.instance,
              builder: (_, __) {
                final mode = ThemeService.instance.themeMode;
                return Icon(
                  mode == ThemeMode.dark
                      ? Icons.dark_mode
                      : mode == ThemeMode.light
                          ? Icons.light_mode
                          : Icons.brightness_auto,
                );
              },
            ),
            tooltip: 'Тема',
          ),
          IconButton(
            onPressed: () async {
              final result = await AppUpdateService.instance.checkForUpdate();
              if (!context.mounted) return;
              if (result != null) {
                _showUpdateDialog(context, result);
              } else {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('У вас актуальна версія')),
                );
              }
            },
            icon: const Icon(Icons.system_update),
            tooltip: 'Перевірити оновлення',
          ),
          IconButton(
            onPressed: () async {
              final ok = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: const Text('Вийти'),
                  content: const Text('Ви впевнені, що хочете вийти з облікового запису?'),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(ctx, false),
                      child: const Text('Скасувати'),
                    ),
                    FilledButton(
                      onPressed: () => Navigator.pop(ctx, true),
                      child: const Text('Вийти'),
                    ),
                  ],
                ),
              );
              if (ok != true || !context.mounted) return;
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
              if (_version.isNotEmpty) ...[
                const SizedBox(height: 16),
                GestureDetector(
                  onTap: () => Navigator.of(context).pushNamed(AboutScreen.routeName),
                  child: Text(
                    'Версія $_version',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.outline,
                        ),
                  ),
                ),
              ],
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
