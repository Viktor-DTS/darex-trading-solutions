class Warehouse {
  Warehouse({
    required this.id,
    required this.name,
    this.region,
  });

  final String id;
  final String name;
  final String? region;

  factory Warehouse.fromJson(Map<String, dynamic> json) {
    return Warehouse(
      id: json['_id']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      region: json['region']?.toString(),
    );
  }
}
