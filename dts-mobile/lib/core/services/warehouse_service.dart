import '../models/warehouse.dart';
import 'api_client.dart';

class WarehouseService {
  WarehouseService._internal();

  static final WarehouseService instance = WarehouseService._internal();

  Future<List<Warehouse>> fetchWarehouses() async {
    final response = await ApiClient.instance.dio.get('/api/warehouses');
    final data = response.data;
    if (data is List) {
      return data
          .whereType<Map<String, dynamic>>()
          .map(Warehouse.fromJson)
          .toList();
    }
    return [];
  }
}
