import 'api_client.dart';

class RegionService {
  RegionService._internal();

  static final RegionService instance = RegionService._internal();

  Future<List<String>> fetchRegions() async {
    final response = await ApiClient.instance.dio.get('/api/regions');
    final data = response.data;
    if (data is List) {
      return data.map((e) => e.toString()).toList();
    }
    return [];
  }
}
