class ClientData {
  ClientData({
    required this.client,
    required this.address,
    required this.invoiceRecipientDetails,
  });

  final String client;
  final String address;
  final String invoiceRecipientDetails;

  factory ClientData.fromJson(Map<String, dynamic> json) {
    return ClientData(
      client: json['client']?.toString() ?? '',
      address: json['address']?.toString() ?? '',
      invoiceRecipientDetails:
          json['invoiceRecipientDetails']?.toString() ?? '',
    );
  }
}
