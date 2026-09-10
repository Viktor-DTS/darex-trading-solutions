import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/task.dart';
import 'api_client.dart';
import 'connectivity_service.dart';
import 'offline_sync_service.dart';

/// Запис кешу списку заявок (in-memory, TTL).
class _TasksCacheEntry {
  final List<Task> tasks;
  final DateTime createdAt;
  final int total;

  _TasksCacheEntry(this.tasks, this.createdAt, [this.total = 0]);

  bool isExpired(int ttlSeconds) =>
      DateTime.now().difference(createdAt).inSeconds > ttlSeconds;
}

class TaskService {
  TaskService._internal();

  static final TaskService instance = TaskService._internal();

  static const _cacheTtlSeconds = 90;
  static const int defaultPageLimit = 30;

  final Map<String, _TasksCacheEntry> _filteredTasksCache = {};

  String _filterCacheKey({
    String? region,
    String? status,
    String? statuses,
    String? sort,
    String? filter,
    bool assignedToMe = false,
  }) {
    return 'filter_${region ?? ''}_${status ?? ''}_${statuses ?? ''}_${sort ?? ''}_${filter ?? ''}_$assignedToMe';
  }

  /// Очистити кеш заявок (наприклад при виході або після створення/редагування).
  void invalidateTasksCache() {
    _filteredTasksCache.clear();
  }

  Future<List<Task>> fetchTasks({
    String? region,
    String? sort,
  }) async {
    final response = await ApiClient.instance.dio.get(
      '/api/tasks',
      queryParameters: {
        if (region != null && region.isNotEmpty) 'region': region,
        if (sort != null && sort.isNotEmpty) 'sort': sort,
      },
    );

    final data = response.data;
    if (data is List) {
      return data
          .whereType<Map<String, dynamic>>()
          .map(Task.fromJson)
          .toList();
    }
    return [];
  }

  /// Завантажує заявки з фільтром і пагінацією.
  /// Повертає (tasks, total). filter — пошук по requestNumber, client, requestDesc (обробляється на бекенді по всіх даних).
  /// [status] — один статус ('Заявка', 'В роботі', 'Виконано').
  /// [statuses] — кілька статусів через кому (наприклад для "Всі": 'Заявка,В роботі,Виконано').
  Future<({List<Task> tasks, int total})> fetchTasksFiltered({
    String? region,
    String? status,
    String? statuses,
    String? sort,
    String? filter,
    int page = 1,
    int limit = defaultPageLimit,
    bool forceRefresh = false,
    bool assignedToMe = false,
  }) async {
    final cacheKey = _filterCacheKey(
      region: region,
      status: status,
      statuses: statuses,
      sort: sort,
      filter: filter,
      assignedToMe: assignedToMe,
    );

    if (!forceRefresh && page == 1) {
      final cached = _filteredTasksCache[cacheKey];
      if (cached != null && !cached.isExpired(_cacheTtlSeconds)) {
        final visible = await _withoutHidden(cached.tasks);
        return (tasks: visible, total: cached.total);
      }
    }

    final params = <String, dynamic>{
      'page': page,
      'limit': limit,
      if (region != null && region.isNotEmpty) 'region': region,
      if (sort != null && sort.isNotEmpty) 'sort': sort,
      if (filter != null && filter.trim().isNotEmpty) 'filter': filter.trim(),
    };
    if (status != null && status.isNotEmpty) {
      params['status'] = status;
    } else if (statuses != null && statuses.isNotEmpty) {
      params['statuses'] = statuses;
    }
    if (assignedToMe) {
      params['assignedToMe'] = '1';
    }

    try {
    final response = await ApiClient.instance.dio.get(
      '/api/tasks/filter',
      queryParameters: params,
    );

    final data = response.data;
    if (data is Map<String, dynamic>) {
      final tasksList = data['tasks'];
      final total = (data['total'] as num?)?.toInt() ?? 0;
      final tasks = (tasksList is List)
          ? tasksList
              .whereType<Map<String, dynamic>>()
              .map(Task.fromJson)
              .toList()
          : <Task>[];
      if (page == 1) {
        _filteredTasksCache[cacheKey] =
            _TasksCacheEntry(tasks, DateTime.now(), total);
        await _persistAssignedCache(tasks, assignedToMe);
      }
      return (tasks: await _withoutHidden(tasks), total: total);
    }
    return (tasks: <Task>[], total: 0);
    } catch (_) {
      if (assignedToMe) {
        final cached = await _loadAssignedCache();
        final hidden = await OfflineSyncService.instance.hiddenTaskIds();
        final visible = cached.where((t) => !hidden.contains(t.id)).toList();
        return (tasks: visible, total: visible.length);
      }
      if (ConnectivityService.instance.isOffline) {
        final mem = _filteredTasksCache[cacheKey];
        if (mem != null) {
          final visible = await _withoutHidden(mem.tasks);
          return (tasks: visible, total: mem.total);
        }
      }
      rethrow;
    }
  }

  Future<List<Task>> _withoutHidden(List<Task> tasks) async {
    final hidden = await OfflineSyncService.instance.hiddenTaskIds();
    if (hidden.isEmpty) return tasks;
    return tasks.where((t) => !hidden.contains(t.id)).toList();
  }

  Future<void> _persistAssignedCache(List<Task> tasks, bool assignedToMe) async {
    if (!assignedToMe) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      'assigned_tasks_cache_v1',
      jsonEncode(tasks.map((t) => t.toJson()).toList()),
    );
  }

  Future<List<Task>> _loadAssignedCache() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('assigned_tasks_cache_v1');
    if (raw == null || raw.isEmpty) return [];
    final decoded = jsonDecode(raw);
    if (decoded is List) {
      return decoded
          .whereType<Map>()
          .map((e) => Task.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    }
    return [];
  }

  Future<void> completeAssignedTask(String taskId) async {
    await ApiClient.instance.dio.post('/api/tasks/$taskId/executor-complete');
    invalidateTasksCache();
  }

  Future<Task> createTask(Map<String, dynamic> payload) async {
    final response = await ApiClient.instance.dio.post(
      '/api/tasks',
      data: payload,
    );
    final data = response.data as Map<String, dynamic>;
    invalidateTasksCache();
    return Task.fromJson(data);
  }

  Future<Task> updateTask({
    required String taskId,
    required Map<String, dynamic> payload,
  }) async {
    final response = await ApiClient.instance.dio.put(
      '/api/tasks/$taskId',
      data: payload,
    );
    final data = response.data as Map<String, dynamic>;
    invalidateTasksCache();
    return Task.fromJson(data);
  }

  Future<Map<String, dynamic>> fetchTask(String taskId) async {
    try {
      final response = await ApiClient.instance.dio.get('/api/tasks/$taskId');
      return response.data as Map<String, dynamic>;
    } catch (_) {
      final cached = await _loadAssignedCache();
      for (final task in cached) {
        if (task.id == taskId) return task.toJson();
      }
      rethrow;
    }
  }
}
