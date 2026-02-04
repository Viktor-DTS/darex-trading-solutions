import 'api_client.dart';

class RegionService {
  RegionService._internal();

  static final RegionService instance = RegionService._internal();

  /// Бекенд повертає список об'єктів [{ name: "Кропивницький" }, ...]; потрібні лише рядки назв.
  Future<List<String>> fetchRegions() async {
    final response = await ApiClient.instance.dio.get('/api/regions');
    final data = response.data;
    if (data is List) {
      return data.map((e) {
        if (e is Map && e['name'] != null) return e['name'].toString().trim();
        if (e is String) return e.trim();
        return e?.toString() ?? '';
      }).where((s) => s.isNotEmpty).toList();
    }
    return [];
  }
}
