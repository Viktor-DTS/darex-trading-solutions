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

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      login: json['login']?.toString() ?? '',
      role: json['role']?.toString() ?? '',
      name: json['name']?.toString(),
      region: json['region']?.toString(),
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
