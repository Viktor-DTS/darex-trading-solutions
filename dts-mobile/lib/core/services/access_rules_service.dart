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
  /// Якщо accessRules в MongoDB порожній або API недоступний — ніхто не отримує доступ (правила порожні).
  Future<Map<String, List<String>>> loadAccessRules() async {
    try {
      final response = await ApiClient.instance.dio.get('/api/accessRules');
      final data = response.data;
      if (data is Map<String, dynamic>) {
        _rules = _convertAccessRules(data);
      } else {
        _rules = {};
      }
    } on DioException catch (_) {
      _rules = {};
    } catch (_) {
      _rules = {};
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
  /// Якщо accessRules порожній (MongoDB або API) — ніхто не отримує доступ.
  /// admin/administrator завжди отримують повний доступ (усі панелі), якщо є в правилах.
  List<String> getPanelsForRole(String role) {
    if (role.isEmpty) return [];
    if (_rules.isEmpty) return [];
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
    if (panels == null) return [];
    if (roleLower == 'admin' || roleLower == 'administrator') {
      return _allPanelIds;
    }
    return panels;
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
    return converted;
  }

  /// Панелі, що мають відповідні модулі в APP. admin/administrator отримують їх усі.
  static const _allPanelIds = [
    'service',
    'operator',
    'warehouse',
    'inventory',
    'manager',
    'testing',
    'accountant',
    'accountantApproval',
  ];
}
