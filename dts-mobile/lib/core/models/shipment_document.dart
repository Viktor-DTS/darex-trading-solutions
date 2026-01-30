class ShipmentDocument {
  ShipmentDocument({
    required this.id,
    required this.documentNumber,
    required this.documentDate,
    this.shippedTo,
    this.status,
    this.items = const [],
  });

  final String id;
  final String documentNumber;
  final String documentDate;
  final String? shippedTo;
  final String? status;
  final List<ShipmentItem> items;

  factory ShipmentDocument.fromJson(Map<String, dynamic> json) {
    return ShipmentDocument(
      id: json['_id']?.toString() ?? '',
      documentNumber: json['documentNumber']?.toString() ?? '',
      documentDate: json['documentDate']?.toString() ?? '',
      shippedTo: json['shippedTo']?.toString(),
      status: json['status']?.toString(),
      items: (json['items'] is List)
          ? (json['items'] as List)
              .whereType<Map<String, dynamic>>()
              .map(ShipmentItem.fromJson)
              .toList()
          : [],
    );
  }
}

class ShipmentItem {
  ShipmentItem({
    required this.equipmentId,
    this.type,
    this.serialNumber,
    this.quantity,
  });

  final String equipmentId;
  final String? type;
  final String? serialNumber;
  final int? quantity;

  factory ShipmentItem.fromJson(Map<String, dynamic> json) {
    return ShipmentItem(
      equipmentId: json['equipmentId']?.toString() ?? '',
      type: json['type']?.toString(),
      serialNumber: json['serialNumber']?.toString(),
      quantity: json['quantity'] is int
          ? json['quantity'] as int
          : int.tryParse(json['quantity']?.toString() ?? ''),
    );
  }
}
