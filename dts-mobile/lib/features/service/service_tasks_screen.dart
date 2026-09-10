import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/models/task.dart';
import '../../core/widgets/error_with_retry.dart';
import '../../core/widgets/loading_skeleton.dart';
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
  final _scrollController = ScrollController();
  bool _loading = false;
  bool _loadingMore = false;
  String? _error;
  List<Task> _tasks = [];
  int _total = 0;
  int _page = 1;
  Timer? _searchDebounce;

  @override
  void initState() {
    super.initState();
    _loadTasks(resetPage: true);
    _searchController.addListener(_onSearchChanged);
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.removeListener(_onSearchChanged);
    _searchController.dispose();
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onSearchChanged() {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 450), () {
      if (mounted) _loadTasks(resetPage: true);
    });
  }

  void _onScroll() {
    final pos = _scrollController.position;
    if (pos.pixels >= pos.maxScrollExtent - 200 &&
        !_loadingMore &&
        _tasks.length < _total) {
      _loadMore();
    }
  }

  /// [forceRefresh] — true при pull-to-refresh або кнопці оновлення.
  /// [resetPage] — true при зміні фільтрів/пошуку.
  Future<void> _loadTasks({
    bool forceRefresh = false,
    bool resetPage = false,
  }) async {
    if (resetPage) _page = 1;
    setState(() {
      _loading = true;
      _error = null;
      if (resetPage) _tasks = [];
    });

    try {
      final region = AuthService.instance.region;
      final filter = _searchController.text.trim();
      final result = await TaskService.instance.fetchTasksFiltered(
        region: region,
        sort: '-requestDate',
        statuses: 'Заявка,В роботі',
        filter: filter.isEmpty ? null : filter,
        page: 1,
        limit: TaskService.defaultPageLimit,
        forceRefresh: forceRefresh,
        assignedToMe: true,
      );
      if (mounted) {
        setState(() {
          _tasks = result.tasks;
          _total = result.total;
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() => _error = AuthService.parseError(error));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || _tasks.length >= _total) return;
    setState(() => _loadingMore = true);
    final nextPage = _page + 1;
    try {
      final region = AuthService.instance.region;
      final filter = _searchController.text.trim();
      final result = await TaskService.instance.fetchTasksFiltered(
        region: region,
        sort: '-requestDate',
        statuses: 'Заявка,В роботі',
        assignedToMe: true,
        filter: filter.isEmpty ? null : filter,
        page: nextPage,
        limit: TaskService.defaultPageLimit,
      );
      if (mounted) {
        setState(() {
          _tasks = [..._tasks, ...result.tasks];
          _page = nextPage;
        });
      }
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Сервісні заявки'),
        actions: [
          IconButton(
            onPressed: () =>
                _loadTasks(forceRefresh: true, resetPage: true),
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
                  const SizedBox(height: 8),
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: Text('Тільки заявки, передані вам як виконавцю'),
                  ),
                ],
              ),
            ),
            Expanded(
              child: _loading && _tasks.isEmpty
                  ? const LoadingSkeleton()
                  : _error != null && _tasks.isEmpty
                      ? ErrorWithRetry(
                          message: _error!,
                          onRetry: () =>
                              _loadTasks(forceRefresh: true, resetPage: true),
                        )
                      : _tasks.isEmpty
                          ? const Center(child: Text('Немає заявок'))
                          : RefreshIndicator(
                              onRefresh: () =>
                                  _loadTasks(forceRefresh: true, resetPage: true),
                              child: ListView.separated(
                                controller: _scrollController,
                                itemCount: _tasks.length +
                                    (_tasks.length < _total ? 1 : 0),
                                separatorBuilder: (_, __) =>
                                    const Divider(height: 1),
                                itemBuilder: (context, index) {
                                  if (index >= _tasks.length) {
                                    return _loadingMore
                                        ? const Padding(
                                            padding: EdgeInsets.all(16),
                                            child: Center(
                                                child:
                                                    CircularProgressIndicator()),
                                          )
                                        : const SizedBox.shrink();
                                  }
                                  final task = _tasks[index];
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
                                  onTap: () async {
                                    final closed = await Navigator.of(context).push<bool>(
                                      MaterialPageRoute(
                                        builder: (_) => TaskDetailsScreen(
                                          task: task,
                                        ),
                                      ),
                                    );
                                    if (closed == true && mounted) {
                                      await _loadTasks(forceRefresh: true, resetPage: true);
                                    }
                                  },
                                  );
                                },
                              ),
                            ),
            ),
            if (_total > 0)
              Padding(
                padding: const EdgeInsets.all(8),
                child: Text(
                  'Показано ${_tasks.length} з $_total',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
