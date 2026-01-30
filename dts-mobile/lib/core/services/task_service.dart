import '../models/task.dart';
import 'api_client.dart';

/// Запис кешу списку заявок (in-memory, TTL).
class _TasksCacheEntry {
  final List<Task> tasks;
  final DateTime createdAt;

  _TasksCacheEntry(this.tasks, this.createdAt);

  bool isExpired(int ttlSeconds) =>
      DateTime.now().difference(createdAt).inSeconds > ttlSeconds;
}

class TaskService {
  TaskService._internal();

  static final TaskService instance = TaskService._internal();

  static const _cacheTtlSeconds = 90;

  final Map<String, _TasksCacheEntry> _filteredTasksCache = {};

  String _filterCacheKey({
    String? region,
    String? status,
    String? statuses,
    String? sort,
  }) {
    return 'filter_${region ?? ''}_${status ?? ''}_${statuses ?? ''}_${sort ?? ''}';
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

  /// Завантажує заявки з фільтром по статусу (менше навантаження на сервер і Mongo).
  /// Якщо [forceRefresh] == false, спочатку перевіряється in-memory кеш (TTL 90 с).
  /// [status] — один статус ('Заявка', 'В роботі', 'Виконано').
  /// [statuses] — кілька статусів через кому (наприклад для "Всі": 'Заявка,В роботі,Виконано').
  Future<List<Task>> fetchTasksFiltered({
    String? region,
    String? status,
    String? statuses,
    String? sort,
    bool forceRefresh = false,
  }) async {
    final cacheKey = _filterCacheKey(
      region: region,
      status: status,
      statuses: statuses,
      sort: sort,
    );

    if (!forceRefresh) {
      final cached = _filteredTasksCache[cacheKey];
      if (cached != null && !cached.isExpired(_cacheTtlSeconds)) {
        return cached.tasks;
      }
    }

    final params = <String, dynamic>{
      if (region != null && region.isNotEmpty) 'region': region,
      if (sort != null && sort.isNotEmpty) 'sort': sort,
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
    if (data is List) {
      final tasks = data
          .whereType<Map<String, dynamic>>()
          .map(Task.fromJson)
          .toList();
      _filteredTasksCache[cacheKey] = _TasksCacheEntry(tasks, DateTime.now());
      return tasks;
    }
    return [];
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
