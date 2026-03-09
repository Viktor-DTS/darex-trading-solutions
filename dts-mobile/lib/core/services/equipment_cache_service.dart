import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Кешує дані обладнання для офлайн-перегляду при відсутності мережі.
class EquipmentCacheService {
  EquipmentCacheService._();
  static final EquipmentCacheService instance = EquipmentCacheService._();

  static const _keyEquipment = 'cache_equipment';
  static const _keyInTransit = 'cache_in_transit';
  static const _keyCachedAt = 'cache_equipment_at';

  Future<void> saveEquipment(List<Map<String, dynamic>> equipment) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyEquipment, jsonEncode(equipment));
    await prefs.setString(_keyCachedAt, DateTime.now().toIso8601String());
  }

  Future<void> saveInTransit(List<Map<String, dynamic>> inTransit) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyInTransit, jsonEncode(inTransit));
  }

  Future<List<Map<String, dynamic>>?> getEquipment() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_keyEquipment);
    if (raw == null) return null;
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list.whereType<Map<String, dynamic>>().toList();
    } catch (_) {
      return null;
    }
  }

  Future<List<Map<String, dynamic>>?> getInTransit() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_keyInTransit);
    if (raw == null) return null;
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list.whereType<Map<String, dynamic>>().toList();
    } catch (_) {
      return null;
    }
  }

  Future<DateTime?> getCachedAt() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_keyCachedAt);
    if (raw == null) return null;
    return DateTime.tryParse(raw);
  }
}
