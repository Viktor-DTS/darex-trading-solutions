class Equipment {
  Equipment({
    required this.id,
    this.type,
    this.serialNumber,
    this.status,
    this.currentWarehouse,
    this.currentWarehouseName,
    this.batchId,
    this.quantity,
    this.isDeleted,
    this.manufacturer,
    this.reservedByName,
    this.reservationClientName,
    this.reservationEndDate,
    this.testingStatus,
    this.testingResult,
    this.testingNotes,
    this.testingMaterials,
    this.testingProcedure,
    this.testingConclusion,
    this.engineer1,
    this.engineer2,
    this.engineer3,
    this.standbyPower,
    this.primePower,
    this.phase,
    this.voltage,
    this.amperage,
    this.rpm,
    this.dimensions,
    this.weight,
    this.manufactureDate,
    this.region,
    this.notes,
    this.attachedFiles,
  });

  final String id;
  final String? type;
  final String? serialNumber;
  final String? status;
  final String? currentWarehouse;
  final String? currentWarehouseName;
  final String? batchId;
  final int? quantity;
  final bool? isDeleted;
  final String? manufacturer;
  final String? reservedByName;
  final String? reservationClientName;
  final String? reservationEndDate;
  final String? testingStatus;
  final String? testingResult;
  final String? testingNotes;
  final String? testingMaterials;
  final String? testingProcedure;
  final String? testingConclusion;
  final String? engineer1;
  final String? engineer2;
  final String? engineer3;
  final String? standbyPower;
  final String? primePower;
  final num? phase;
  final String? voltage;
  final num? amperage;
  final num? rpm;
  final String? dimensions;
  final num? weight;
  final String? manufactureDate;
  final String? region;
  final String? notes;
  final List<AttachedFile>? attachedFiles;

  factory Equipment.fromJson(Map<String, dynamic> json) {
    List<AttachedFile>? files;
    if (json['attachedFiles'] is List) {
      files = (json['attachedFiles'] as List)
          .whereType<Map<String, dynamic>>()
          .map(AttachedFile.fromJson)
          .toList();
    }
    return Equipment(
      id: json['_id']?.toString() ?? '',
      type: json['type']?.toString(),
      serialNumber: json['serialNumber']?.toString(),
      status: json['status']?.toString(),
      currentWarehouse: json['currentWarehouse']?.toString(),
      currentWarehouseName: json['currentWarehouseName']?.toString(),
      batchId: json['batchId']?.toString(),
      quantity: json['quantity'] is int
          ? json['quantity'] as int
          : int.tryParse(json['quantity']?.toString() ?? ''),
      isDeleted: json['isDeleted'] == true,
      manufacturer: json['manufacturer']?.toString(),
      reservedByName: json['reservedByName']?.toString(),
      reservationClientName: json['reservationClientName']?.toString(),
      reservationEndDate: json['reservationEndDate']?.toString(),
      testingStatus: json['testingStatus']?.toString(),
      testingResult: json['result']?.toString() ?? json['testingResult']?.toString(),
      testingNotes: json['notes']?.toString() ?? json['testingNotes']?.toString(),
      testingMaterials:
          json['materials']?.toString() ?? json['testingMaterials']?.toString(),
      testingProcedure:
          json['procedure']?.toString() ?? json['testingProcedure']?.toString(),
      testingConclusion:
          json['conclusion']?.toString() ?? json['testingConclusion']?.toString(),
      engineer1: json['engineer1']?.toString() ?? json['testingEngineer1']?.toString(),
      engineer2: json['engineer2']?.toString() ?? json['testingEngineer2']?.toString(),
      engineer3: json['engineer3']?.toString() ?? json['testingEngineer3']?.toString(),
      standbyPower: json['standbyPower']?.toString(),
      primePower: json['primePower']?.toString(),
      phase: json['phase'] is num ? json['phase'] as num : null,
      voltage: json['voltage']?.toString(),
      amperage: json['amperage'] is num ? json['amperage'] as num : null,
      rpm: json['rpm'] is num ? json['rpm'] as num : null,
      dimensions: json['dimensions']?.toString(),
      weight: json['weight'] is num ? json['weight'] as num : null,
      manufactureDate: json['manufactureDate']?.toString(),
      region: json['region']?.toString(),
      notes: json['notes']?.toString(),
      attachedFiles: files,
    );
  }
}

class AttachedFile {
  AttachedFile({
    this.cloudinaryUrl,
    this.originalName,
    this.mimetype,
    this.size,
  });

  final String? cloudinaryUrl;
  final String? originalName;
  final String? mimetype;
  final int? size;

  factory AttachedFile.fromJson(Map<String, dynamic> json) {
    return AttachedFile(
      cloudinaryUrl: json['cloudinaryUrl']?.toString(),
      originalName: json['originalName']?.toString(),
      mimetype: json['mimetype']?.toString(),
      size: json['size'] is int ? json['size'] as int : int.tryParse(json['size']?.toString() ?? ''),
    );
  }
}
