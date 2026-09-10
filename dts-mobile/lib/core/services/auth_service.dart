import 'dart:convert';

import 'package:dio/dio.dart';

import '../models/user.dart';
import '../session.dart';
import 'access_rules_service.dart';
import 'api_client.dart';
import 'offline_sync_service.dart';
import 'push_notification_service.dart';
import 'secure_storage.dart';
import 'task_service.dart';

class AuthService {
  AuthService._internal();

  static final AuthService instance = AuthService._internal();

  Future<void> init() async {
    final token = await SecureStorage.readToken();
    final userJson = await SecureStorage.readUserJson();
    Session.loadFromJson(token, userJson);
    if (token == null || token.isEmpty) return;

    if (!await validateSession()) {
      await expireSession();
      return;
    }
    await AccessRulesService.instance.loadAccessRules();
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
    await SecureStorage.saveCredentials(login: login, password: password);

    await PushNotificationService.instance.refreshToken();
    await AccessRulesService.instance.loadAccessRules();
    await OfflineSyncService.instance.flush();

    return user;
  }

  Future<({String login, String password})?> readSavedCredentials() {
    return SecureStorage.readCredentials();
  }

  /// Перевіряє JWT локально і запитом до API. Офлайн не вважаємо виходом.
  Future<bool> validateSession() async {
    final token = Session.token;
    if (token == null || token.isEmpty) return false;
    if (_isJwtExpired(token)) return false;
    try {
      await ApiClient.instance.dio.get('/api/accessRules');
      return true;
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) return false;
      return true;
    } catch (_) {
      return true;
    }
  }

  /// Прострочена сесія: вихід без стирання збереженого логіна/пароля.
  Future<void> expireSession() async {
    AccessRulesService.instance.clear();
    Session.clear();
    await SecureStorage.clearSession();
    TaskService.instance.invalidateTasksCache();
  }

  Future<void> logout() async {
    await PushNotificationService.instance.clearToken();
    AccessRulesService.instance.clear();
    Session.clear();
    await SecureStorage.clearSession();
    TaskService.instance.invalidateTasksCache();
  }

  String? get role => Session.user?.role;
  String? get region => Session.user?.region;
  String? get userLogin => Session.user?.login;
  String? get userName => Session.user?.name ?? Session.user?.login;
  bool get isAuthenticated => Session.token?.isNotEmpty ?? false;
  bool get isAdmin {
    final r = (role ?? '').toLowerCase();
    return r == 'admin' || r == 'administrator';
  }
  bool get isServiceRole => (role ?? '').toLowerCase() == 'service';

  static bool _isJwtExpired(String token) {
    try {
      final parts = token.split('.');
      if (parts.length != 3) return true;
      final payload = jsonDecode(
        utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
      );
      final exp = payload is Map ? payload['exp'] : null;
      if (exp is num) {
        return DateTime.now().millisecondsSinceEpoch >= (exp * 1000).round();
      }
    } catch (_) {}
    return false;
  }

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
