import 'dart:convert';

import 'models/user.dart';

class Session {
  static String? token;
  static User? user;

  static void loadFromJson(String? tokenValue, String? userJson) {
    token = tokenValue;
    if (userJson == null) {
      user = null;
      return;
    }
    user = User.fromJson(jsonDecode(userJson) as Map<String, dynamic>);
  }

  static void clear() {
    token = null;
    user = null;
  }
}
