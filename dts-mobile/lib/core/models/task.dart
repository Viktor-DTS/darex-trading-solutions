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
    this.assignedExecutorLogin,
    this.assignedExecutorName,
    this.executorWorkStatus,
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
  final String? assignedExecutorLogin;
  final String? assignedExecutorName;
  final String? executorWorkStatus;

  bool get isExecutorCompleted =>
      executorWorkStatus == 'Виконавець виконав роботу';

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
      assignedExecutorLogin: json['assignedExecutorLogin']?.toString(),
      assignedExecutorName: json['assignedExecutorName']?.toString(),
      executorWorkStatus: json['executorWorkStatus']?.toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      '_id': id,
      'id': id,
      'status': status,
      'requestNumber': requestNumber,
      'client': client,
      'requestDesc': requestDesc,
      'requestDate': requestDate,
      'serviceRegion': serviceRegion,
      'work': work,
      'materials': materials,
      'comments': comments,
      'workPrice': workPrice,
      'transportKm': transportKm,
      'transportSum': transportSum,
      'assignedExecutorLogin': assignedExecutorLogin,
      'assignedExecutorName': assignedExecutorName,
      'executorWorkStatus': executorWorkStatus,
    };
  }
}
