class MovementDocument {
  MovementDocument({
    required this.id,
    required this.documentNumber,
    required this.documentDate,
    this.fromWarehouseName,
    this.toWarehouseName,
    this.status,
    this.items = const [],
  });

  final String id;
  final String documentNumber;
  final String documentDate;
  final String? fromWarehouseName;
  final String? toWarehouseName;
  final String? status;
  final List<MovementItem> items;

  factory MovementDocument.fromJson(Map<String, dynamic> json) {
    return MovementDocument(
      id: json['_id']?.toString() ?? '',
      documentNumber: json['documentNumber']?.toString() ?? '',
      documentDate: json['documentDate']?.toString() ?? '',
      fromWarehouseName: json['fromWarehouseName']?.toString(),
      toWarehouseName: json['toWarehouseName']?.toString(),
      status: json['status']?.toString(),
      items: (json['items'] is List)
          ? (json['items'] as List)
              .whereType<Map<String, dynamic>>()
              .map(MovementItem.fromJson)
              .toList()
          : [],
    );
  }
}

class MovementItem {
  MovementItem({
    required this.equipmentId,
    this.type,
    this.serialNumber,
    this.quantity,
  });

  final String equipmentId;
  final String? type;
  final String? serialNumber;
  final int? quantity;

  factory MovementItem.fromJson(Map<String, dynamic> json) {
    return MovementItem(
      equipmentId: json['equipmentId']?.toString() ?? '',
      type: json['type']?.toString(),
      serialNumber: json['serialNumber']?.toString(),
      quantity: json['quantity'] is int
          ? json['quantity'] as int
          : int.tryParse(json['quantity']?.toString() ?? ''),
    );
  }
}
