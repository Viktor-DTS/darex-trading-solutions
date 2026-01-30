import 'api_client.dart';

class EventLogService {
  EventLogService._internal();

  static final EventLogService instance = EventLogService._internal();

  Future<List<Map<String, dynamic>>> fetchEvents({
    String? entityType,
    int page = 1,
    int limit = 50,
  }) async {
    final response = await ApiClient.instance.dio.get(
      '/api/event-log',
      queryParameters: {
        if (entityType != null) 'entityType': entityType,
        'page': page,
        'limit': limit,
      },
    );
    final data = response.data as Map<String, dynamic>;
    final events = data['events'];
    if (events is List) {
      return events.whereType<Map<String, dynamic>>().toList();
    }
    return [];
  }
}
