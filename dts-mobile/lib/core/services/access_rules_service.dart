/// Сервіс для завантаження прав доступу до панелей з бекенду.
/// Формат API: { role: { panelId: 'full'|'read'|'none' } }
library;

import 'package:dio/dio.dart';

import 'api_client.dart';

class AccessRulesService {
  AccessRulesService._internal();

  static final AccessRulesService instance = AccessRulesService._internal();

  /// Конвертовані правила: role -> [panelId з full або read]
  Map<String, List<String>> _rules = {};
  bool _loaded = false;

  /// Завантажує правила з API та кешує їх.
  Future<Map<String, List<String>>> loadAccessRules() async {
    try {
      final response = await ApiClient.instance.dio.get('/api/accessRules');
      final data = response.data;
      if (data is Map<String, dynamic>) {
        _rules = _convertAccessRules(data);
      }
    } on DioException catch (e) {
      if (e.response?.statusCode != null) {
        // Не логуємо помилки мережі щоб не засмічувати - використовуємо fallback
      }
      _rules = _defaultRules;
    } catch (_) {
      _rules = _defaultRules;
    }
    _loaded = true;
    return _rules;
  }

  /// Повертає кешовані правила або завантажує їх.
  Future<Map<String, List<String>>> getRules() async {
    if (_loaded) return _rules;
    return loadAccessRules();
  }

  /// Список panel IDs з доступом (full або read) для ролі.
  List<String> getPanelsForRole(String role) {
    if (role.isEmpty) return [];
    if (_rules.isEmpty) return _defaultRules[role] ?? _defaultRules['service'] ?? [];
    final roleLower = role.toLowerCase();
    final exact = _rules[role];
    if (exact != null && exact.isNotEmpty) return exact;
    for (final entry in _rules.entries) {
      if (entry.key.toLowerCase() == roleLower) return entry.value;
    }
    return _defaultRules[role] ?? _defaultRules['service'] ?? [];
  }

  /// Очистити кеш (наприклад при logout).
  void clear() {
    _rules = {};
    _loaded = false;
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
      // Авто-додавання inventory якщо є warehouse або accountant
      if ((list.contains('warehouse') || list.contains('accountant')) &&
          !list.contains('inventory')) {
        final invValue = panels['inventory'];
        if (invValue != 'none') list.add('inventory');
      }
      converted[role] = list;
    }
    for (final r in ['admin', 'administrator']) {
      if (!converted.containsKey(r) || converted[r]!.isEmpty) {
        converted[r] = _defaultRules[r]!;
      }
    }
    return converted;
  }

  /// Резервні правила (як на вебі), якщо API недоступний.
  static const _defaultRules = <String, List<String>>{
    'admin': ['service', 'operator', 'warehouse', 'inventory', 'manager', 'testing', 'accountant', 'accountantApproval', 'regional', 'reports', 'analytics', 'admin'],
    'administrator': ['service', 'operator', 'warehouse', 'inventory', 'manager', 'testing', 'accountant', 'accountantApproval', 'regional', 'reports', 'analytics', 'admin'],
    'operator': ['operator'],
    'accountant': ['accountant', 'accountantApproval', 'inventory', 'reports', 'analytics'],
    'buhgalteria': ['accountant', 'accountantApproval', 'inventory', 'reports', 'analytics'],
    'warehouse': ['warehouse', 'inventory', 'service'],
    'zavsklad': ['warehouse', 'inventory', 'service'],
    'regkerivn': ['regional', 'service', 'reports', 'analytics', 'inventory', 'manager'],
    'regional': ['regional', 'service', 'reports', 'analytics', 'inventory', 'manager'],
    'service': ['service'],
    'testing': ['testing'],
    'tester': ['testing'],
    'manager': ['manager', 'inventory'],
    'regionwten': ['regional', 'service', 'reports', 'analytics', 'inventory', 'manager'],
    'adminminor': ['service', 'operator', 'warehouse', 'inventory'],
  };
}
