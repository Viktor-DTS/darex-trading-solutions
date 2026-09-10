import 'dart:convert';
import 'dart:io';

import 'package:gal/gal.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';
import 'assigned_inbox_service.dart';
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

  Future<Directory> _backupDir(String taskId) async {
    final dir = await getApplicationDocumentsDirectory();
    final folder = Directory('${dir.path}/photo_backup/$taskId');
    if (!folder.existsSync()) {
      await folder.create(recursive: true);
    }
    return folder;
  }

  Future<Directory> _queueDir(String taskId) async {
    final dir = await getApplicationDocumentsDirectory();
    final folder = Directory('${dir.path}/offline_uploads/$taskId');
    if (!folder.existsSync()) {
      await folder.create(recursive: true);
    }
    return folder;
  }

  Future<File> _copyLocal(XFile file, Directory folder) async {
    final name = file.name.isNotEmpty
        ? file.name
        : 'photo_${DateTime.now().millisecondsSinceEpoch}.jpg';
    final dest = File('${folder.path}/${DateTime.now().millisecondsSinceEpoch}_$name');
    try {
      await File(file.path).copy(dest.path);
    } catch (_) {
      try {
        await file.saveTo(dest.path);
      } catch (_) {
        await dest.writeAsBytes(await file.readAsBytes(), flush: true);
      }
    }
    return dest;
  }

  Future<void> saveToGallery(String path) async {
    try {
      final allowed = await Gal.hasAccess(toAlbum: true) || await Gal.requestAccess(toAlbum: true);
      if (!allowed) return;
      await Gal.putImage(path, album: 'DTS Mobile');
    } catch (_) {}
  }

  /// Копія в сховищі додатка + галерея телефону. Не видаляється після синку.
  Future<File> keepDeviceCopy({
    required String taskId,
    required XFile file,
  }) async {
    final backup = await _copyLocal(file, await _backupDir(taskId));
    await saveToGallery(backup.path);
    return backup;
  }

  Future<List<File>> backupsForTask(String taskId) async {
    try {
      final folder = await _backupDir(taskId);
      if (!folder.existsSync()) return [];
      final files = folder
          .listSync()
          .whereType<File>()
          .toList()
        ..sort((a, b) => b.path.compareTo(a.path));
      return files;
    } catch (_) {
      return [];
    }
  }

  Future<int> pendingPhotoCount(String taskId) async {
    final queue = await _readQueue();
    return queue.where((item) {
      return item['type'] == 'photo' && item['taskId']?.toString() == taskId;
    }).length;
  }

  Future<void> enqueuePhoto({
    required String taskId,
    required XFile file,
  }) async {
    final dest = await _copyLocal(file, await _queueDir(taskId));
    final queue = await _readQueue();
    queue.add({
      'type': 'photo',
      'taskId': taskId,
      'path': dest.path,
      'name': file.name.isNotEmpty ? file.name : dest.uri.pathSegments.last,
      'createdAt': DateTime.now().toIso8601String(),
    });
    await _writeQueue(queue);
  }

  Future<void> enqueueComplete(String taskId) async {
    await AssignedInboxService.instance.markPendingComplete(taskId);
    final queue = await _readQueue();
    final already = queue.any((item) =>
        item['type'] == 'complete' && item['taskId']?.toString() == taskId);
    if (!already) {
      queue.add({
        'type': 'complete',
        'taskId': taskId,
        'createdAt': DateTime.now().toIso8601String(),
      });
      await _writeQueue(queue);
    }
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
            await AssignedInboxService.instance.removeTask(taskId);
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
