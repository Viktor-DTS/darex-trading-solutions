import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/task.dart';
import '../session.dart';
import 'api_client.dart';
import 'secure_storage.dart';

/// Локальний ящик призначених заявок: лишаються на телефоні до виконання,
/// скасування призначення або успішної синхронізації офлайн-закриття.
class AssignedInboxService extends ChangeNotifier {
  AssignedInboxService._internal();

  static final AssignedInboxService instance = AssignedInboxService._internal();

  static const _inboxKey = 'assigned_inbox_v2';
  static const _pendingKey = 'assigned_pending_complete_v1';
  static const _legacyListKey = 'assigned_tasks_cache_v1';
  static const _legacyDetailsKey = 'task_details_cache_v1';

  Future<void> _ensureSession() async {
    if (Session.token != null && Session.token!.isNotEmpty) return;
    final token = await SecureStorage.readToken();
    final userJson = await SecureStorage.readUserJson();
    Session.loadFromJson(token, userJson);
  }

  Future<Map<String, Map<String, dynamic>>> _readInbox() async {
    final prefs = await SharedPreferences.getInstance();
    await _migrateLegacy(prefs);
    final raw = prefs.getString(_inboxKey);
    if (raw == null || raw.isEmpty) return {};
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return {};
      final out = <String, Map<String, dynamic>>{};
      for (final entry in decoded.entries) {
        final value = entry.value;
        if (value is Map) {
          out[entry.key.toString()] = Map<String, dynamic>.from(value);
        }
      }
      return out;
    } catch (_) {
      return {};
    }
  }

  Future<void> _writeInbox(Map<String, Map<String, dynamic>> inbox) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_inboxKey, jsonEncode(inbox));
    notifyListeners();
  }

  Future<void> _migrateLegacy(SharedPreferences prefs) async {
    if (prefs.containsKey(_inboxKey)) return;
    final inbox = <String, Map<String, dynamic>>{};
    final listRaw = prefs.getString(_legacyListKey);
    if (listRaw != null && listRaw.isNotEmpty) {
      try {
        final decoded = jsonDecode(listRaw);
        if (decoded is List) {
          for (final item in decoded.whereType<Map>()) {
            final map = Map<String, dynamic>.from(item);
            final id = map['_id']?.toString() ?? map['id']?.toString() ?? '';
            if (id.isNotEmpty) inbox[id] = map;
          }
        }
      } catch (_) {}
    }
    final detailsRaw = prefs.getString(_legacyDetailsKey);
    if (detailsRaw != null && detailsRaw.isNotEmpty) {
      try {
        final decoded = jsonDecode(detailsRaw);
        if (decoded is Map) {
          for (final entry in decoded.entries) {
            final value = entry.value;
            if (value is Map) {
              inbox[entry.key.toString()] = Map<String, dynamic>.from(value);
            }
          }
        }
      } catch (_) {}
    }
    if (inbox.isNotEmpty) {
      await prefs.setString(_inboxKey, jsonEncode(inbox));
    }
  }

  Future<Set<String>> pendingCompleteIds() async {
    final prefs = await SharedPreferences.getInstance();
    return (prefs.getStringList(_pendingKey) ?? []).toSet();
  }

  Future<bool> isPendingComplete(String taskId) async {
    final ids = await pendingCompleteIds();
    return ids.contains(taskId);
  }

  Future<void> markPendingComplete(String taskId) async {
    if (taskId.isEmpty) return;
    final prefs = await SharedPreferences.getInstance();
    final ids = prefs.getStringList(_pendingKey) ?? [];
    if (!ids.contains(taskId)) {
      ids.add(taskId);
      await prefs.setStringList(_pendingKey, ids);
      notifyListeners();
    }
  }

  Future<void> _clearPending(String taskId) async {
    final prefs = await SharedPreferences.getInstance();
    final ids = prefs.getStringList(_pendingKey) ?? [];
    if (ids.remove(taskId)) {
      await prefs.setStringList(_pendingKey, ids);
    }
  }

  Future<List<Task>> listTasks({String query = ''}) async {
    final inbox = await _readInbox();
    final q = query.trim().toLowerCase();
    final tasks = inbox.values.map(Task.fromJson).toList();
    tasks.sort((a, b) => (b.requestDate ?? '').compareTo(a.requestDate ?? ''));
    if (q.isEmpty) return tasks;
    return tasks.where((task) {
      return [
        task.requestNumber,
        task.client,
        task.requestDesc,
        task.status,
      ].whereType<String>().any((value) => value.toLowerCase().contains(q));
    }).toList();
  }

  Future<Map<String, dynamic>?> taskMap(String taskId) async {
    final inbox = await _readInbox();
    return inbox[taskId];
  }

  Future<void> upsertTask(Task task) async {
    if (task.id.isEmpty) return;
    await upsertMap(task.toJson());
  }

  Future<void> upsertMap(Map<String, dynamic> data) async {
    final id = data['_id']?.toString() ?? data['id']?.toString() ?? '';
    if (id.isEmpty) return;
    final inbox = await _readInbox();
    final current = inbox[id] ?? <String, dynamic>{};
    inbox[id] = {...current, ...data, '_id': id, 'id': id};
    await _writeInbox(inbox);
  }

  Future<void> removeTask(String taskId) async {
    if (taskId.isEmpty) return;
    final inbox = await _readInbox();
    final removed = inbox.remove(taskId) != null;
    await _clearPending(taskId);
    if (removed) {
      await _dropQueuedComplete(taskId);
      await _writeInbox(inbox);
    } else {
      await _dropQueuedComplete(taskId);
      notifyListeners();
    }
  }

  Future<void> _dropQueuedComplete(String taskId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      const queueKey = 'offline_sync_queue_v1';
      final raw = prefs.getString(queueKey);
      if (raw == null || raw.isEmpty) return;
      final decoded = jsonDecode(raw);
      if (decoded is! List) return;
      final next = decoded.where((item) {
        if (item is! Map) return true;
        return !(item['type'] == 'complete' && item['taskId']?.toString() == taskId);
      }).toList();
      await prefs.setString(queueKey, jsonEncode(next));
    } catch (_) {}
  }

  /// Серверний знімок: замінює ящик, але лишає заявки з офлайн-закриттям.
  Future<void> applyServerSnapshot(List<Map<String, dynamic>> serverTasks) async {
    final pending = await pendingCompleteIds();
    final previous = await _readInbox();
    final next = <String, Map<String, dynamic>>{};
    for (final item in serverTasks) {
      final id = item['_id']?.toString() ?? item['id']?.toString() ?? '';
      if (id.isEmpty) continue;
      final current = previous[id] ?? <String, dynamic>{};
      next[id] = {...current, ...item, '_id': id, 'id': id};
    }
    for (final id in pending) {
      if (!next.containsKey(id) && previous[id] != null) {
        next[id] = previous[id]!;
      }
    }
    await _writeInbox(next);
  }

  Future<void> downloadTask(String taskId) async {
    if (taskId.isEmpty) return;
    await _ensureSession();
    if (Session.token == null || Session.token!.isEmpty) return;
    final response = await ApiClient.instance.dio.get('/api/tasks/$taskId');
    final data = response.data;
    if (data is Map<String, dynamic>) {
      await upsertMap(data);
    }
  }

  /// Push прийшов при наявності інтернету — зберігаємо заявку одразу, без кліку.
  Future<void> ingestPush(Map<String, dynamic> data) async {
    final type = data['type']?.toString() ?? '';
    final taskId = data['taskId']?.toString() ?? '';
    if (taskId.isEmpty) return;

    if (type == 'task_unassigned') {
      await removeTask(taskId);
      return;
    }
    if (type != 'task_assigned') return;

    await upsertMap({
      '_id': taskId,
      'id': taskId,
      'requestNumber': data['taskNumber'],
      'client': data['customer'],
      'requestDesc': data['address'],
      'serviceRegion': data['region'],
      'status': (data['status']?.toString().isNotEmpty ?? false)
          ? data['status']
          : 'В роботі',
      'executorWorkStatus': 'Передано в роботу',
      'address': data['address'],
    });
    try {
      await downloadTask(taskId);
    } catch (_) {}
  }

  Future<void> clearAll() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_inboxKey);
    await prefs.remove(_pendingKey);
    await prefs.remove(_legacyListKey);
    await prefs.remove(_legacyDetailsKey);
    notifyListeners();
  }
}
