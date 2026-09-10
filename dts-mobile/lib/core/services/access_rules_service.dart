/// Сервіс для завантаження прав доступу до панелей з бекенду.
/// Формат API: { role: { panelId: 'full'|'read'|'none' } }
library;

import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';
import 'connectivity_service.dart';

class AccessRulesService {
  AccessRulesService._internal();

  static final AccessRulesService instance = AccessRulesService._internal();

  static const _cacheKey = 'access_rules_cache_v1';

  /// Конвертовані правила: role -> [panelId з full або read]
  Map<String, List<String>> _rules = {};
  bool _loaded = false;

  /// Кеш з диска без мережевого запиту (старт додатка офлайн).
  Future<void> preloadFromDisk() async {
    if (_rules.isEmpty) {
      await _loadFromDisk();
    }
  }

  /// Завантажує правила з API та кешує їх на пристрій.
  /// Якщо мережа недоступна — лишає останній успішний кеш.
  Future<Map<String, List<String>>> loadAccessRules() async {
    if (_rules.isEmpty) {
      await _loadFromDisk();
    }
    if (ConnectivityService.instance.isOffline) {
      _loaded = true;
      return _rules;
    }
    try {
      final response = await ApiClient.instance.dio.get('/api/accessRules');
      final data = response.data;
      if (data is Map<String, dynamic>) {
        _rules = _convertAccessRules(data);
        await _saveToDisk(_rules);
      }
    } on DioException catch (_) {
      if (_rules.isEmpty) {
        await _loadFromDisk();
      }
    } catch (_) {
      if (_rules.isEmpty) {
        await _loadFromDisk();
      }
    }
    _loaded = true;
    return _rules;
  }

  /// Повертає кешовані правила або завантажує їх.
  Future<Map<String, List<String>>> getRules() async {
    if (_loaded && _rules.isNotEmpty) return _rules;
    if (_rules.isEmpty) {
      await _loadFromDisk();
    }
    if (_loaded) return _rules;
    return loadAccessRules();
  }

  /// Список panel IDs з доступом (full або read) для ролі.
  List<String> getPanelsForRole(String role) {
    if (role.isEmpty) return [];
    final roleLower = role.toLowerCase();
    List<String>? panels;
    final exact = _rules[role];
    if (exact != null) {
      panels = exact;
    } else {
      for (final entry in _rules.entries) {
        if (entry.key.toLowerCase() == roleLower) {
          panels = entry.value;
          break;
        }
      }
    }
    if (roleLower == 'admin' || roleLower == 'administrator') {
      if (panels != null && panels.isNotEmpty) return _allPanelIds;
      if (ConnectivityService.instance.isOffline) return _allPanelIds;
      return panels ?? [];
    }
    if (panels != null && panels.isNotEmpty) return panels;
    return _offlineFallbackPanels(roleLower);
  }

  /// Очистити кеш (logout).
  Future<void> clear() async {
    _rules = {};
    _loaded = false;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_cacheKey);
  }

  Future<void> _saveToDisk(Map<String, List<String>> rules) async {
    final prefs = await SharedPreferences.getInstance();
    final encoded = <String, dynamic>{
      for (final e in rules.entries) e.key: e.value,
    };
    await prefs.setString(_cacheKey, jsonEncode(encoded));
  }

  Future<void> _loadFromDisk() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_cacheKey);
      if (raw == null || raw.isEmpty) return;
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return;
      final restored = <String, List<String>>{};
      for (final entry in decoded.entries) {
        final value = entry.value;
        if (value is List) {
          restored[entry.key.toString()] =
              value.map((e) => e.toString()).toList();
        }
      }
      if (restored.isNotEmpty) {
        _rules = restored;
        _loaded = true;
      }
    } catch (_) {}
  }

  static List<String> _offlineFallbackPanels(String roleLower) {
    switch (roleLower) {
      case 'service':
        return ['service'];
      case 'warehouse':
      case 'bczvskl':
        return ['warehouse', 'inventory'];
      case 'operator':
        return ['operator'];
      case 'testing':
        return ['testing'];
      case 'manager':
        return ['manager'];
      default:
        return [];
    }
  }

  /// Конвертує { role: { panelId: 'full'|'read'|'none' } } у { role: [panelId...] }
  static Map<String, List<String>> _convertAccessRules(Map<String, dynamic> dbRules) {
    final converted = <String, List<String>>{};
    for (final entry in dbRules.entries) {
      final role = entry.key;
      final panels = entry.value;
      if (panels is! Map) continue;
      final list = <String>[];
      for (final panelEntry in panels.entries) {
        if (panelEntry.value == 'full' || panelEntry.value == 'read') {
          list.add(panelEntry.key);
        }
      }
      if ((list.contains('warehouse') || list.contains('accountant')) &&
          !list.contains('inventory')) {
        final invValue = panels['inventory'];
        if (invValue != 'none') list.add('inventory');
      }
      converted[role] = list;
    }
    return converted;
  }

  static const _allPanelIds = [
    'service',
    'operator',
    'warehouse',
    'inventory',
    'manager',
    'testing',
    'finance',
    'accountant',
    'accountantApproval',
  ];
}
