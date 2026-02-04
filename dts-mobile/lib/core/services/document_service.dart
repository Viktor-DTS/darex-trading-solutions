import '../models/movement_document.dart';
import '../models/receipt_document.dart';
import '../models/shipment_document.dart';
import 'api_client.dart';

class DocumentService {
  DocumentService._internal();

  static final DocumentService instance = DocumentService._internal();

  Future<List<ReceiptDocument>> fetchReceiptDocuments() async {
    final response =
        await ApiClient.instance.dio.get('/api/documents/receipt');
    final data = response.data;
    if (data is List) {
      return data
          .whereType<Map<String, dynamic>>()
          .map(ReceiptDocument.fromJson)
          .toList();
    }
    return [];
  }

  Future<List<MovementDocument>> fetchMovementDocuments() async {
    final response =
        await ApiClient.instance.dio.get('/api/documents/movement');
    final data = response.data;
    if (data is List) {
      return data
          .whereType<Map<String, dynamic>>()
          .map(MovementDocument.fromJson)
          .toList();
    }
    return [];
  }

  Future<List<ShipmentDocument>> fetchShipmentDocuments() async {
    final response =
        await ApiClient.instance.dio.get('/api/documents/shipment');
    final data = response.data;
    if (data is List) {
      return data
          .whereType<Map<String, dynamic>>()
          .map(ShipmentDocument.fromJson)
          .toList();
    }
    return [];
  }
}
