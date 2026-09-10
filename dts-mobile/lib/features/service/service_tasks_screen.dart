import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/models/task.dart';
import '../../core/widgets/error_with_retry.dart';
import '../../core/widgets/loading_skeleton.dart';
import '../../core/services/assigned_inbox_service.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/connectivity_service.dart';
import '../../core/services/task_service.dart';
import 'task_details_screen.dart';

class ServiceTasksScreen extends StatefulWidget {
  const ServiceTasksScreen({super.key});

  static const routeName = '/service/tasks';

  @override
  State<ServiceTasksScreen> createState() => _ServiceTasksScreenState();
}

class _ServiceTasksScreenState extends State<ServiceTasksScreen>
    with WidgetsBindingObserver {
  final _searchController = TextEditingController();
  final _scrollController = ScrollController();
  final _statuses = const ['Всі', 'Заявка', 'В роботі', 'Виконано'];
  String _selectedStatus = 'Всі';
  bool _loading = false;
  bool _loadingMore = false;
  String? _error;
  List<Task> _tasks = [];
  Set<String> _pendingComplete = {};
  int _total = 0;
  int _page = 1;
  Timer? _searchDebounce;

  bool get _assignedToMe => AuthService.instance.isServiceRole;

  /// Як у продакшені: адмін бачить усі заявки; регіональні — свій регіон.
  /// Роль service у APP — лише заявки, передані через продакшн.
  String? get _filterRegion {
    final auth = AuthService.instance;
    if (auth.isAdmin || _assignedToMe) return null;
    return auth.region;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    AssignedInboxService.instance.addListener(_onInboxChanged);
    ConnectivityService.instance.addListener(_onConnectivityChanged);
    _loadTasks(resetPage: true);
    _searchController.addListener(_onSearchChanged);
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    AssignedInboxService.instance.removeListener(_onInboxChanged);
    ConnectivityService.instance.removeListener(_onConnectivityChanged);
    _searchDebounce?.cancel();
    _searchController.removeListener(_onSearchChanged);
    _searchController.dispose();
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _loadTasks(forceRefresh: true);
    }
  }

  void _onInboxChanged() {
    if (_assignedToMe) {
      unawaited(_showInbox());
    }
  }

  void _onConnectivityChanged() {
    if (ConnectivityService.instance.isOnline) {
      unawaited(_loadTasks(forceRefresh: true));
    } else {
      unawaited(_showInbox());
    }
  }

  Future<void> _showInbox() async {
    if (!_assignedToMe) return;
    final cached = await AssignedInboxService.instance.listTasks(
      query: _searchController.text.trim(),
    );
    final pending = await AssignedInboxService.instance.pendingCompleteIds();
    if (!mounted) return;
    setState(() {
      _tasks = cached;
      _total = cached.length;
      _pendingComplete = pending;
      if (cached.isNotEmpty) _error = null;
    });
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
    if (_assignedToMe) {
      await _showInbox();
    }
    setState(() {
      _loading = true;
      _error = null;
      if (resetPage && !_assignedToMe) _tasks = [];
    });

    try {
      final assignedToMe = _assignedToMe;
      final filter = _searchController.text.trim();
      final result = await TaskService.instance.fetchTasksFiltered(
        region: _filterRegion,
        sort: '-requestDate',
        status: assignedToMe || _selectedStatus == 'Всі' ? null : _selectedStatus,
        statuses: assignedToMe
            ? 'Заявка,В роботі'
            : (_selectedStatus == 'Всі' ? 'Заявка,В роботі,Виконано' : null),
        filter: filter.isEmpty ? null : filter,
        page: 1,
        limit: TaskService.defaultPageLimit,
        forceRefresh: forceRefresh,
        assignedToMe: assignedToMe,
      );
      final pending = assignedToMe
          ? await AssignedInboxService.instance.pendingCompleteIds()
          : <String>{};
      if (mounted) {
        setState(() {
          _tasks = result.tasks;
          _total = result.total;
          _pendingComplete = pending;
        });
      }
    } catch (error) {
      if (_assignedToMe) {
        await _showInbox();
      }
      if (mounted && _tasks.isEmpty) {
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
      final assignedToMe = _assignedToMe;
      final filter = _searchController.text.trim();
      final result = await TaskService.instance.fetchTasksFiltered(
        region: _filterRegion,
        sort: '-requestDate',
        status: assignedToMe || _selectedStatus == 'Всі' ? null : _selectedStatus,
        statuses: assignedToMe
            ? 'Заявка,В роботі'
            : (_selectedStatus == 'Всі' ? 'Заявка,В роботі,Виконано' : null),
        assignedToMe: assignedToMe,
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
                  if (AuthService.instance.isServiceRole)
                    const Align(
                      alignment: Alignment.centerLeft,
                      child: Text('Тільки заявки, передані вам як виконавцю'),
                    )
                  else ...[
                    const SizedBox(height: 4),
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
                              setState(() => _selectedStatus = status);
                              _loadTasks(resetPage: true);
                            },
                          );
                        },
                      ),
                    ),
                  ],
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
                                  final pending = _pendingComplete.contains(task.id);
                                  final yellow = const Color(0xFFFFF59D);
                                return ColoredBox(
                                  color: pending ? yellow : Colors.transparent,
                                  child: ListTile(
                                  title: Text(
                                    task.requestNumber ?? 'Без номера',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w600,
                                      color: pending ? Colors.black : null,
                                    ),
                                  ),
                                  subtitle: Text(
                                    pending
                                        ? 'Чекаємо інтернет та синхронізації з базою'
                                        : [
                                            task.client ?? 'Клієнт не вказано',
                                            task.requestDesc ?? 'Опис відсутній',
                                          ].join(' · '),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      color: pending ? Colors.black87 : null,
                                      fontWeight: pending ? FontWeight.w600 : null,
                                    ),
                                  ),
                                  trailing: Column(
                                    crossAxisAlignment: CrossAxisAlignment.end,
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Text(
                                        pending ? 'Очікує синхронізації' : task.status,
                                        style: TextStyle(
                                          fontWeight: FontWeight.w600,
                                          color: pending ? Colors.black : null,
                                        ),
                                      ),
                                      if (!pending && task.requestDate != null)
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
                                    if (!mounted) return;
                                    await _loadTasks(forceRefresh: closed == true, resetPage: true);
                                  },
                                  ),
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
