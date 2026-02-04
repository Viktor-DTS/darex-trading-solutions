class User {
  User({
    required this.login,
    required this.role,
    this.name,
    this.region,
  });

  final String login;
  final String role;
  final String? name;
  final String? region;

  /// region з бекенду може бути рядком або об'єктом { name: "..." }; завжди зберігаємо рядок або null.
  static String? _regionFromJson(dynamic value) {
    if (value == null) return null;
    String s;
    if (value is String) {
      s = value.trim();
    } else if (value is Map && value['name'] != null) {
      s = value['name'].toString().trim();
    } else {
      s = value.toString().trim();
    }
    return s.isEmpty ? null : s;
  }

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      login: json['login']?.toString() ?? '',
      role: json['role']?.toString() ?? '',
      name: json['name']?.toString(),
      region: _regionFromJson(json['region']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'login': login,
      'role': role,
      'name': name,
      'region': region,
    };
  }
}
