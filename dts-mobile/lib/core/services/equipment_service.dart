import '../models/equipment.dart';
import 'api_client.dart';

class EquipmentService {
  EquipmentService._internal();

  static final EquipmentService instance = EquipmentService._internal();

  Future<List<Equipment>> fetchEquipment({String? status}) async {
    final response = await ApiClient.instance.dio.get(
      '/api/equipment',
      queryParameters: {
        if (status != null && status.isNotEmpty) 'status': status,
      },
    );

    final data = response.data;
    if (data is List) {
      return data
          .whereType<Map<String, dynamic>>()
          .map(Equipment.fromJson)
          .toList();
    }
    return [];
  }

  Future<void> moveEquipment({
    required String equipmentId,
    required String toWarehouseId,
    required String toWarehouseName,
    String? reason,
    String? notes,
  }) async {
    await ApiClient.instance.dio.post(
      '/api/equipment/$equipmentId/move',
      data: {
        'toWarehouse': toWarehouseId,
        'toWarehouseName': toWarehouseName,
        'reason': reason ?? '',
        'notes': notes ?? '',
      },
    );
  }

  Future<void> shipEquipment({
    required String equipmentId,
    required String shippedTo,
    String? orderNumber,
    String? invoiceNumber,
    String? clientEdrpou,
    String? clientAddress,
    String? invoiceRecipientDetails,
    String? notes,
  }) async {
    await ApiClient.instance.dio.post(
      '/api/equipment/$equipmentId/ship',
      data: {
        'shippedTo': shippedTo,
        'orderNumber': orderNumber ?? '',
        'invoiceNumber': invoiceNumber ?? '',
        'clientEdrpou': clientEdrpou ?? '',
        'clientAddress': clientAddress ?? '',
        'invoiceRecipientDetails': invoiceRecipientDetails ?? '',
        'notes': notes ?? '',
      },
    );
  }

  Future<void> approveReceipt(List<String> equipmentIds) async {
    await ApiClient.instance.dio.post(
      '/api/equipment/approve-receipt',
      data: {'equipmentIds': equipmentIds},
    );
  }

  /// Історія резервувань (для панелі Менеджери).
  Future<List<Map<String, dynamic>>> fetchReservationHistory() async {
    final response =
        await ApiClient.instance.dio.get('/api/equipment/reservation-history');
    final data = response.data;
    if (data is List) {
      return data.whereType<Map<String, dynamic>>().toList();
    }
    return [];
  }

  /// Заявка на тестування обладнання (для менеджерів).
  Future<void> requestTesting(String equipmentId) async {
    await ApiClient.instance.dio.post(
      '/api/equipment/$equipmentId/request-testing',
    );
  }

  /// Деталі обладнання по id (повний обʼєкт з API).
  Future<Map<String, dynamic>> fetchEquipmentById(String id) async {
    final response =
        await ApiClient.instance.dio.get('/api/equipment/$id');
    final data = response.data;
    return data is Map<String, dynamic> ? data : <String, dynamic>{};
  }

  /// Резервування обладнання (clientName обовʼязковий).
  Future<void> reserveEquipment({
    required String equipmentId,
    required String clientName,
    String? notes,
    String? endDate,
  }) async {
    await ApiClient.instance.dio.post(
      '/api/equipment/$equipmentId/reserve',
      data: {
        'clientName': clientName,
        'notes': notes ?? '',
        'endDate': endDate,
      },
    );
  }

  Future<void> completeTesting({
    required String equipmentId,
    required String result,
    String? notes,
    String? materials,
    String? procedure,
    String? conclusion,
    String? engineer1,
    String? engineer2,
    String? engineer3,
  }) async {
    await ApiClient.instance.dio.post(
      '/api/equipment/$equipmentId/complete-testing',
      data: {
        'result': result,
        'notes': notes ?? '',
        'materials': materials ?? '',
        'procedure': procedure ?? '',
        'conclusion': conclusion ?? '',
        'engineer1': engineer1 ?? '',
        'engineer2': engineer2 ?? '',
        'engineer3': engineer3 ?? '',
      },
    );
  }

  Future<void> updateTesting({
    required String equipmentId,
    String? result,
    String? notes,
    String? materials,
    String? procedure,
    String? conclusion,
    String? engineer1,
    String? engineer2,
    String? engineer3,
  }) async {
    await ApiClient.instance.dio.put(
      '/api/equipment/$equipmentId/update-testing',
      data: {
        'result': result ?? '',
        'notes': notes ?? '',
        'materials': materials ?? '',
        'procedure': procedure ?? '',
        'conclusion': conclusion ?? '',
        'engineer1': engineer1 ?? '',
        'engineer2': engineer2 ?? '',
        'engineer3': engineer3 ?? '',
      },
    );
  }

  Future<void> scanEquipment(Map<String, dynamic> payload) async {
    await ApiClient.instance.dio.post(
      '/api/equipment/scan',
      data: payload,
    );
  }

  Future<void> moveBatch({
    required String batchId,
    required int quantity,
    required String fromWarehouse,
    required String fromWarehouseName,
    required String toWarehouse,
    required String toWarehouseName,
    String? reason,
    String? notes,
  }) async {
    await ApiClient.instance.dio.post(
      '/api/equipment/batch/move',
      data: {
        'batchId': batchId,
        'quantity': quantity,
        'fromWarehouse': fromWarehouse,
        'fromWarehouseName': fromWarehouseName,
        'toWarehouse': toWarehouse,
        'toWarehouseName': toWarehouseName,
        'reason': reason ?? '',
        'notes': notes ?? '',
      },
    );
  }

  Future<void> shipBatch({
    required String batchId,
    required int quantity,
    required String fromWarehouse,
    required String shippedTo,
    String? orderNumber,
    String? invoiceNumber,
    String? clientEdrpou,
    String? clientAddress,
    String? invoiceRecipientDetails,
    String? notes,
  }) async {
    await ApiClient.instance.dio.post(
      '/api/equipment/batch/ship',
      data: {
        'batchId': batchId,
        'quantity': quantity,
        'fromWarehouse': fromWarehouse,
        'shippedTo': shippedTo,
        'orderNumber': orderNumber ?? '',
        'invoiceNumber': invoiceNumber ?? '',
        'clientEdrpou': clientEdrpou ?? '',
        'clientAddress': clientAddress ?? '',
        'invoiceRecipientDetails': invoiceRecipientDetails ?? '',
        'notes': notes ?? '',
      },
    );
  }
}
