import 'dart:convert';
import 'dart:io';

import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';
import 'connectivity_service.dart';
import 'file_service.dart';
import 'task_service.dart';

class OfflineSyncService {
  OfflineSyncService._internal();

  static final OfflineSyncService instance = OfflineSyncService._internal();

  static const _queueKey = 'offline_sync_queue_v1';
  static const _hiddenKey = 'offline_hidden_task_ids_v1';

  bool _flushing = false;

  Future<List<Map<String, dynamic>>> _readQueue() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_queueKey);
    if (raw == null || raw.isEmpty) return [];
    final decoded = jsonDecode(raw);
    if (decoded is List) {
      return decoded.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    }
    return [];
  }

  Future<void> _writeQueue(List<Map<String, dynamic>> queue) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_queueKey, jsonEncode(queue));
  }

  Future<Set<String>> hiddenTaskIds() async {
    final prefs = await SharedPreferences.getInstance();
    return (prefs.getStringList(_hiddenKey) ?? []).toSet();
  }

  Future<void> _hideTask(String taskId) async {
    final prefs = await SharedPreferences.getInstance();
    final ids = prefs.getStringList(_hiddenKey) ?? [];
    if (!ids.contains(taskId)) {
      ids.add(taskId);
      await prefs.setStringList(_hiddenKey, ids);
    }
  }

  Future<void> _unhideTask(String taskId) async {
    final prefs = await SharedPreferences.getInstance();
    final ids = prefs.getStringList(_hiddenKey) ?? [];
    ids.remove(taskId);
    await prefs.setStringList(_hiddenKey, ids);
  }

  Future<void> enqueuePhoto({
    required String taskId,
    required XFile file,
  }) async {
    final dir = await getApplicationDocumentsDirectory();
    final folder = Directory('${dir.path}/offline_uploads/$taskId');
    if (!folder.existsSync()) {
      await folder.create(recursive: true);
    }
    final name = file.name.isNotEmpty
        ? file.name
        : 'photo_${DateTime.now().millisecondsSinceEpoch}.jpg';
    final dest = File('${folder.path}/${DateTime.now().millisecondsSinceEpoch}_$name');
    await File(file.path).copy(dest.path);

    final queue = await _readQueue();
    queue.add({
      'type': 'photo',
      'taskId': taskId,
      'path': dest.path,
      'name': name,
      'createdAt': DateTime.now().toIso8601String(),
    });
    await _writeQueue(queue);
  }

  Future<void> enqueueComplete(String taskId) async {
    await _hideTask(taskId);
    final queue = await _readQueue();
    queue.add({
      'type': 'complete',
      'taskId': taskId,
      'createdAt': DateTime.now().toIso8601String(),
    });
    await _writeQueue(queue);
  }

  Future<void> flush() async {
    if (_flushing || ConnectivityService.instance.isOffline) return;
    _flushing = true;
    try {
      var queue = await _readQueue();
      if (queue.isEmpty) return;
      final remaining = <Map<String, dynamic>>[];
      for (final item in queue) {
        try {
          final type = item['type']?.toString();
          final taskId = item['taskId']?.toString() ?? '';
          if (taskId.isEmpty) continue;
          if (type == 'photo') {
            final path = item['path']?.toString() ?? '';
            final name = item['name']?.toString() ?? 'photo.jpg';
            if (path.isEmpty || !File(path).existsSync()) continue;
            await FileService.instance.uploadTaskFiles(
              taskId: taskId,
              files: [XFile(path, name: name)],
            );
            try {
              await File(path).delete();
            } catch (_) {}
          } else if (type == 'complete') {
            await ApiClient.instance.dio.post('/api/tasks/$taskId/executor-complete');
            await _unhideTask(taskId);
            TaskService.instance.invalidateTasksCache();
          }
        } catch (_) {
          remaining.add(item);
        }
      }
      await _writeQueue(remaining);
    } finally {
      _flushing = false;
    }
  }
}
