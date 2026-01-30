import 'dart:convert';

import 'package:dio/dio.dart';

import '../models/user.dart';
import '../session.dart';
import 'api_client.dart';
import 'secure_storage.dart';
import 'task_service.dart';

class AuthService {
  AuthService._internal();

  static final AuthService instance = AuthService._internal();

  Future<void> init() async {
    final token = await SecureStorage.readToken();
    final userJson = await SecureStorage.readUserJson();
    Session.loadFromJson(token, userJson);
  }

  Future<User> login({
    required String login,
    required String password,
  }) async {
    final response = await ApiClient.instance.dio.post(
      '/api/auth',
      data: {
        'login': login,
        'password': password,
      },
    );

    final data = response.data as Map<String, dynamic>;
    final token = data['token']?.toString() ?? '';
    final user = User.fromJson(data['user'] as Map<String, dynamic>);

    Session.token = token;
    Session.user = user;

    await SecureStorage.saveToken(token);
    await SecureStorage.saveUserJson(jsonEncode(user.toJson()));

    return user;
  }

  Future<void> logout() async {
    Session.clear();
    await SecureStorage.clear();
    TaskService.instance.invalidateTasksCache();
  }

  String? get role => Session.user?.role;
  String? get region => Session.user?.region;
  String? get userName => Session.user?.name ?? Session.user?.login;
  bool get isAuthenticated => (Session.token?.isNotEmpty ?? false);

  static String parseError(Object error) {
    if (error is DioException) {
      final data = error.response?.data;
      if (data is Map<String, dynamic> && data['error'] != null) {
        return data['error'].toString();
      }
      return error.message ?? 'Помилка зʼєднання';
    }
    return error.toString();
  }
}
