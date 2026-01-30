import 'package:dio/dio.dart';

import '../models/client_data.dart';
import 'api_client.dart';

class ClientService {
  ClientService._internal();

  static final ClientService instance = ClientService._internal();

  Future<ClientData> fetchClientData(String edrpou) async {
    final response = await ApiClient.instance.dio.get(
      '/api/client-data/$edrpou',
    );
    final data = response.data as Map<String, dynamic>;
    return ClientData.fromJson(data);
  }

  /// Таймаут 30 с, щоб не зависати при повільному API.
  static const Duration _edrpouListTimeout = Duration(seconds: 30);

  Future<List<String>> fetchEdrpouList() async {
    final response = await ApiClient.instance.dio.get(
      '/api/edrpou-list',
      options: Options(
        receiveTimeout: _edrpouListTimeout,
        sendTimeout: _edrpouListTimeout,
      ),
    );
    final data = response.data;
    if (data is List) {
      return data.map((e) => e.toString()).toList();
    }
    return [];
  }
}
