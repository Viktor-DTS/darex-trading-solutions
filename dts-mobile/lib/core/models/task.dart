class Task {
  Task({
    required this.id,
    required this.status,
    this.requestNumber,
    this.client,
    this.requestDesc,
    this.requestDate,
    this.serviceRegion,
    this.work,
    this.materials,
    this.comments,
    this.workPrice,
    this.transportKm,
    this.transportSum,
  });

  final String id;
  final String status;
  final String? requestNumber;
  final String? client;
  final String? requestDesc;
  final String? requestDate;
  final String? serviceRegion;
  final String? work;
  final String? materials;
  final String? comments;
  final String? workPrice;
  final String? transportKm;
  final String? transportSum;

  factory Task.fromJson(Map<String, dynamic> json) {
    return Task(
      id: json['_id']?.toString() ?? json['id']?.toString() ?? '',
      status: json['status']?.toString() ?? '',
      requestNumber: json['requestNumber']?.toString(),
      client: json['client']?.toString(),
      requestDesc: json['requestDesc']?.toString(),
      requestDate: json['requestDate']?.toString(),
      serviceRegion: json['serviceRegion']?.toString(),
      work: json['work']?.toString(),
      materials: json['materials']?.toString(),
      comments: json['comments']?.toString(),
      workPrice: json['workPrice']?.toString(),
      transportKm: json['transportKm']?.toString(),
      transportSum: json['transportSum']?.toString(),
    );
  }
}
