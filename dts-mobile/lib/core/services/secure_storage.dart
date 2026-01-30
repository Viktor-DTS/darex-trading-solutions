import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureStorage {
  static const _tokenKey = 'auth_token';
  static const _userKey = 'auth_user';

  static const _storage = FlutterSecureStorage();

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

  static Future<void> clear() async {
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _userKey);
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
