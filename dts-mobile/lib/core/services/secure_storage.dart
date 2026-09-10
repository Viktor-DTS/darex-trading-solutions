import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureStorage {
  static const _tokenKey = 'auth_token';
  static const _userKey = 'auth_user';
  static const _loginKey = 'auth_login';
  static const _passwordKey = 'auth_password';
  static const _pendingPushKey = 'pending_push';

  static const _storage = FlutterSecureStorage(
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  );

  static Future<void> saveToken(String token) async {
    await _storage.write(key: _tokenKey, value: token);
  }

  static Future<String?> readToken() async {
    return _storage.read(key: _tokenKey);
  }

  static Future<void> saveUserJson(String json) async {
    await _storage.write(key: _userKey, value: json);
  }

  static Future<String?> readUserJson() async {
    return _storage.read(key: _userKey);
  }

  static Future<void> saveCredentials({
    required String login,
    required String password,
  }) async {
    await _storage.write(key: _loginKey, value: login);
    await _storage.write(key: _passwordKey, value: password);
  }

  static Future<({String login, String password})?> readCredentials() async {
    final login = await _storage.read(key: _loginKey);
    final password = await _storage.read(key: _passwordKey);
    if (login == null || login.isEmpty || password == null || password.isEmpty) {
      return null;
    }
    return (login: login, password: password);
  }

  static Future<void> clearCredentials() async {
    await _storage.delete(key: _loginKey);
    await _storage.delete(key: _passwordKey);
  }

  static Future<void> savePendingPush(String json) async {
    await _storage.write(key: _pendingPushKey, value: json);
  }

  static Future<String?> readPendingPush() async {
    return _storage.read(key: _pendingPushKey);
  }

  static Future<void> clearPendingPush() async {
    await _storage.delete(key: _pendingPushKey);
  }

  /// Скидає сесію, але лишає логін/пароль і pending push.
  static Future<void> clearSession() async {
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _userKey);
  }

  static Future<void> clear() async {
    await clearSession();
    await clearCredentials();
    await clearPendingPush();
  }

  static Future<void> writeString(String key, String value) async {
    await _storage.write(key: key, value: value);
  }

  static Future<String?> readString(String key) async {
    return _storage.read(key: key);
  }

  static Future<void> deleteKey(String key) async {
    await _storage.delete(key: key);
  }
}
