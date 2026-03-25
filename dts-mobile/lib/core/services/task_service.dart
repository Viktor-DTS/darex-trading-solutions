import '../models/task.dart';
import 'api_client.dart';

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
  }) {
    return 'filter_${region ?? ''}_${status ?? ''}_${statuses ?? ''}_${sort ?? ''}_${filter ?? ''}';
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
  }) async {
    final cacheKey = _filterCacheKey(
      region: region,
      status: status,
      statuses: statuses,
      sort: sort,
      filter: filter,
    );

    if (!forceRefresh && page == 1) {
      final cached = _filteredTasksCache[cacheKey];
      if (cached != null && !cached.isExpired(_cacheTtlSeconds)) {
        return (tasks: cached.tasks, total: cached.total);
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
      }
      return (tasks: tasks, total: total);
    }
    return (tasks: <Task>[], total: 0);
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
    final response = await ApiClient.instance.dio.get('/api/tasks/$taskId');
    final data = response.data as Map<String, dynamic>;
    return data;
  }
}
