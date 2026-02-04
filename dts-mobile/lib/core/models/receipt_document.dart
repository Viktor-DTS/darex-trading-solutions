class ReceiptDocument {
  ReceiptDocument({
    required this.id,
    required this.documentNumber,
    required this.documentDate,
    this.supplier,
    this.warehouse,
    this.warehouseName,
    this.items = const [],
    this.status,
    this.totalAmount,
    this.currency,
    this.notes,
  });

  final String id;
  final String documentNumber;
  final String documentDate;
  final String? supplier;
  final String? warehouse;
  final String? warehouseName;
  final List<ReceiptItem> items;
  final String? status;
  final num? totalAmount;
  final String? currency;
  final String? notes;

  factory ReceiptDocument.fromJson(Map<String, dynamic> json) {
    return ReceiptDocument(
      id: json['_id']?.toString() ?? '',
      documentNumber: json['documentNumber']?.toString() ?? '',
      documentDate: json['documentDate']?.toString() ?? '',
      supplier: json['supplier']?.toString(),
      warehouse: json['warehouse']?.toString(),
      warehouseName: json['warehouseName']?.toString(),
      items: (json['items'] is List)
          ? (json['items'] as List)
              .whereType<Map<String, dynamic>>()
              .map(ReceiptItem.fromJson)
              .toList()
          : [],
      status: json['status']?.toString(),
      totalAmount: json['totalAmount'] is num ? json['totalAmount'] as num : null,
      currency: json['currency']?.toString(),
      notes: json['notes']?.toString(),
    );
  }
}

class ReceiptItem {
  ReceiptItem({
    this.equipmentId,
    this.type,
    this.serialNumber,
    this.quantity = 1,
    this.batchId,
    this.batchName,
    this.notes,
  });

  final String? equipmentId;
  final String? type;
  final String? serialNumber;
  final int quantity;
  final String? batchId;
  final String? batchName;
  final String? notes;

  factory ReceiptItem.fromJson(Map<String, dynamic> json) {
    return ReceiptItem(
      equipmentId: json['equipmentId']?.toString(),
      type: json['type']?.toString(),
      serialNumber: json['serialNumber']?.toString(),
      quantity: json['quantity'] is int ? json['quantity'] as int : int.tryParse(json['quantity']?.toString() ?? '1') ?? 1,
      batchId: json['batchId']?.toString(),
      batchName: json['batchName']?.toString(),
      notes: json['notes']?.toString(),
    );
  }
}
