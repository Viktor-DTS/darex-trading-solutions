import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';

import '../../core/services/connectivity_service.dart';
import '../../core/services/file_service.dart';
import '../../core/services/offline_sync_service.dart';

/// Зйомка кількох фото підряд: кожне підтверджується, без повернення на заявку.
/// У кінці всі підтверджені файли завантажуються разом.
class PhotoCaptureSessionScreen extends StatefulWidget {
  const PhotoCaptureSessionScreen({super.key, required this.taskId});

  final String taskId;

  @override
  State<PhotoCaptureSessionScreen> createState() =>
      _PhotoCaptureSessionScreenState();
}

class _PhotoCaptureSessionScreenState extends State<PhotoCaptureSessionScreen> {
  final _picker = ImagePicker();
  final _accepted = <File>[];
  File? _pending;
  bool _shooting = false;
  bool _uploading = false;
  String? _error;
  late final Directory _sessionDir;

  @override
  void initState() {
    super.initState();
    _prepareAndShoot();
  }

  Future<void> _prepareAndShoot() async {
    final root = await getTemporaryDirectory();
    _sessionDir = Directory(
      '${root.path}/photo_session/${widget.taskId}/${DateTime.now().millisecondsSinceEpoch}',
    );
    await _sessionDir.create(recursive: true);
    if (!mounted) return;
    await _shoot();
  }

  Future<void> _shoot() async {
    if (_shooting || _uploading) return;
    setState(() {
      _shooting = true;
      _pending = null;
      _error = null;
    });
    try {
      final file = await _picker.pickImage(
        source: ImageSource.camera,
        imageQuality: 85,
        preferredCameraDevice: CameraDevice.rear,
      );
      if (!mounted) return;
      if (file == null) {
        setState(() => _shooting = false);
        if (_accepted.isEmpty) {
          Navigator.of(context).pop(false);
        }
        return;
      }
      final dest = File(
        '${_sessionDir.path}/${DateTime.now().millisecondsSinceEpoch}.jpg',
      );
      try {
        await File(file.path).copy(dest.path);
      } catch (_) {
        await dest.writeAsBytes(await file.readAsBytes(), flush: true);
      }
      if (!mounted) return;
      setState(() {
        _pending = dest;
        _shooting = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _shooting = false;
        _error = error.toString();
      });
    }
  }

  void _confirmPending() {
    final file = _pending;
    if (file == null) return;
    setState(() {
      _accepted.add(file);
      _pending = null;
    });
    _shoot();
  }

  void _retakePending() {
    final file = _pending;
    setState(() => _pending = null);
    if (file != null) {
      try {
        file.deleteSync();
      } catch (_) {}
    }
    _shoot();
  }

  void _removeAccepted(int index) {
    final file = _accepted.removeAt(index);
    setState(() {});
    try {
      file.deleteSync();
    } catch (_) {}
  }

  Future<void> _uploadAll() async {
    if (_accepted.isEmpty || _uploading) return;
    setState(() {
      _uploading = true;
      _error = null;
    });
    try {
      final copies = <XFile>[];
      for (final file in _accepted) {
        final backup = await OfflineSyncService.instance.keepDeviceCopy(
          taskId: widget.taskId,
          file: XFile(file.path, name: file.uri.pathSegments.last),
        );
        copies.add(XFile(backup.path, name: backup.uri.pathSegments.last));
      }
      final offline = ConnectivityService.instance.isOffline;
      if (offline) {
        for (final file in copies) {
          await OfflineSyncService.instance.enqueuePhoto(
            taskId: widget.taskId,
            file: file,
          );
        }
      } else {
        try {
          await FileService.instance.uploadTaskFiles(
            taskId: widget.taskId,
            files: copies,
          );
        } catch (_) {
          for (final file in copies) {
            await OfflineSyncService.instance.enqueuePhoto(
              taskId: widget.taskId,
              file: file,
            );
          }
        }
      }
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.toString();
        _uploading = false;
      });
    }
  }

  Future<bool> _confirmLeave() async {
    if (_accepted.isEmpty || _uploading) return true;
    final action = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Є підтверджені фото'),
        content: Text(
          'Підтверджено ${_accepted.length} фото. Завантажити їх до заявки чи вийти без завантаження?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, 'stay'),
            child: const Text('Назад'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, 'leave'),
            child: const Text('Вийти'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, 'upload'),
            child: const Text('Завантажити'),
          ),
        ],
      ),
    );
    if (action == 'upload') {
      await _uploadAll();
      return false;
    }
    return action == 'leave';
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _accepted.isEmpty && _pending == null && !_uploading,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final leave = await _confirmLeave();
        if (leave && context.mounted) Navigator.of(context).pop(false);
      },
      child: Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
          backgroundColor: Colors.black,
          foregroundColor: Colors.white,
          title: Text(
            _pending != null
                ? 'Перевірте якість'
                : 'Фото (${_accepted.length})',
          ),
        ),
        body: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_uploading) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: Colors.white),
            SizedBox(height: 16),
            Text(
              'Завантаження фото до заявки…',
              style: TextStyle(color: Colors.white),
            ),
          ],
        ),
      );
    }
    if (_shooting && _pending == null) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: Colors.white),
            SizedBox(height: 16),
            Text(
              'Відкриваємо камеру…',
              style: TextStyle(color: Colors.white70),
            ),
          ],
        ),
      );
    }
    if (_pending != null) {
      return _buildPreview(_pending!);
    }
    return _buildReview();
  }

  Widget _buildPreview(File file) {
    return Column(
      children: [
        Expanded(
          child: InteractiveViewer(
            minScale: 0.5,
            maxScale: 4,
            child: Center(
              child: Image.file(file, fit: BoxFit.contain),
            ),
          ),
        ),
        SafeArea(
          top: false,
          child: Container(
          width: double.infinity,
          color: Colors.black,
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Column(
            children: [
              Text(
                'Підтверджено: ${_accepted.length}',
                style: const TextStyle(color: Colors.white70),
              ),
              const SizedBox(height: 6),
              const Text(
                'Перевірте різкість і світло. Якщо погано — перезняти.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white70, fontSize: 13),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _retakePending,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: const BorderSide(color: Colors.white54),
                      ),
                      icon: const Icon(Icons.refresh),
                      label: const Text('Перезняти'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: _confirmPending,
                      icon: const Icon(Icons.check),
                      label: const Text('Добре, ще фото'),
                    ),
                  ),
                ],
              ),
              if (_accepted.isNotEmpty) ...[
                const SizedBox(height: 8),
                TextButton(
                  onPressed: () => setState(() => _pending = null),
                  child: Text(
                    'До списку (${_accepted.length}) і завантажити',
                    style: const TextStyle(color: Colors.white70),
                  ),
                ),
              ],
            ],
          ),
        ),
        ),
      ],
    );
  }

  Widget _buildReview() {
    return Column(
      children: [
        if (_error != null)
          Padding(
            padding: const EdgeInsets.all(12),
            child: Text(_error!, style: const TextStyle(color: Colors.redAccent)),
          ),
        Expanded(
          child: _accepted.isEmpty
              ? const Center(
                  child: Text(
                    'Немає підтверджених фото',
                    style: TextStyle(color: Colors.white70),
                  ),
                )
              : GridView.builder(
                  padding: const EdgeInsets.all(12),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    mainAxisSpacing: 8,
                    crossAxisSpacing: 8,
                  ),
                  itemCount: _accepted.length,
                  itemBuilder: (context, index) {
                    return Stack(
                      fit: StackFit.expand,
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.file(_accepted[index], fit: BoxFit.cover),
                        ),
                        Positioned(
                          top: 0,
                          right: 0,
                          child: IconButton(
                            onPressed: () => _removeAccepted(index),
                            icon: const Icon(Icons.close, color: Colors.white),
                            style: IconButton.styleFrom(
                              backgroundColor: Colors.black54,
                            ),
                          ),
                        ),
                      ],
                    );
                  },
                ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Column(
              children: [
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: _shoot,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.white,
                      side: const BorderSide(color: Colors.white54),
                    ),
                    icon: const Icon(Icons.photo_camera),
                    label: const Text('Ще фото'),
                  ),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: _accepted.isEmpty ? null : _uploadAll,
                    icon: const Icon(Icons.cloud_upload),
                    label: Text(
                      _accepted.isEmpty
                          ? 'Завантажити до заявки'
                          : 'Завантажити ${_accepted.length} фото до заявки',
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
