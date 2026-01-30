import 'package:flutter/material.dart';

import '../../core/models/task.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/task_service.dart';
import 'task_details_screen.dart';

class ServiceTasksScreen extends StatefulWidget {
  const ServiceTasksScreen({super.key});

  static const routeName = '/service/tasks';

  @override
  State<ServiceTasksScreen> createState() => _ServiceTasksScreenState();
}

class _ServiceTasksScreenState extends State<ServiceTasksScreen> {
  final _searchController = TextEditingController();
  final _statuses = const ['Всі', 'Заявка', 'В роботі', 'Виконано'];
  String _selectedStatus = 'Заявка';
  bool _loading = false;
  String? _error;
  List<Task> _tasks = [];

  @override
  void initState() {
    super.initState();
    _loadTasks();
    _searchController.addListener(_applyFilters);
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  /// [forceRefresh] — true при pull-to-refresh або кнопці оновлення (ігнорує кеш).
  Future<void> _loadTasks({bool forceRefresh = false}) async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final region = AuthService.instance.region;
      // Кеш 90 с на клієнті — менше запитів при перемиканні вкладок
      final tasks = await TaskService.instance.fetchTasksFiltered(
        region: region,
        sort: '-requestDate',
        status: _selectedStatus == 'Всі' ? null : _selectedStatus,
        statuses: _selectedStatus == 'Всі' ? 'Заявка,В роботі,Виконано' : null,
        forceRefresh: forceRefresh,
      );
      setState(() {
        _tasks = tasks;
      });
    } catch (error) {
      setState(() {
        _error = AuthService.parseError(error);
      });
    } finally {
      setState(() {
        _loading = false;
      });
    }
  }

  List<Task> get _filteredTasks {
    final query = _searchController.text.trim().toLowerCase();
    if (query.isEmpty) return _tasks;
    return _tasks.where((task) {
      return (task.requestNumber?.toLowerCase().contains(query) ?? false) ||
          (task.client?.toLowerCase().contains(query) ?? false) ||
          (task.requestDesc?.toLowerCase().contains(query) ?? false);
    }).toList();
  }

  void _applyFilters() {
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Сервісні заявки'),
        actions: [
          IconButton(
            onPressed: () => _loadTasks(forceRefresh: true),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  TextField(
                    controller: _searchController,
                    decoration: const InputDecoration(
                      labelText: 'Пошук (номер, клієнт, опис)',
                      prefixIcon: Icon(Icons.search),
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 36,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: _statuses.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 8),
                      itemBuilder: (context, index) {
                        final status = _statuses[index];
                        final isSelected = status == _selectedStatus;
                        return ChoiceChip(
                          label: Text(status),
                          selected: isSelected,
                          onSelected: (_) {
                            if (isSelected) return;
                            setState(() {
                              _selectedStatus = status;
                            });
                            _loadTasks();
                          },
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: _loading && _tasks.isEmpty
                  ? const Center(child: CircularProgressIndicator())
                  : _error != null && _tasks.isEmpty
                      ? Center(child: Text(_error!))
                      : _filteredTasks.isEmpty
                          ? const Center(child: Text('Немає заявок'))
                          : RefreshIndicator(
                              onRefresh: () => _loadTasks(forceRefresh: true),
                              child: ListView.separated(
                              itemCount: _filteredTasks.length,
                              separatorBuilder: (_, __) =>
                                  const Divider(height: 1),
                              itemBuilder: (context, index) {
                                final task = _filteredTasks[index];
                                return ListTile(
                                  title: Text(
                                    task.requestNumber ?? 'Без номера',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  subtitle: Text(
                                    [
                                      task.client ?? 'Клієнт не вказано',
                                      task.requestDesc ?? 'Опис відсутній',
                                    ].join(' · '),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  trailing: Column(
                                    crossAxisAlignment: CrossAxisAlignment.end,
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Text(
                                        task.status,
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      if (task.requestDate != null)
                                        Text(
                                          task.requestDate!,
                                          style: Theme.of(context)
                                              .textTheme
                                              .bodySmall,
                                        ),
                                    ],
                                  ),
                                  onTap: () {
                                    Navigator.of(context).push(
                                      MaterialPageRoute(
                                        builder: (_) => TaskDetailsScreen(
                                          task: task,
                                        ),
                                      ),
                                    );
                                    },
                                  );
                                },
                              ),
                            ),
            ),
          ],
        ),
      ),
    );
  }
}
