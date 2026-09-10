import 'dart:async';
import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../core/services/connectivity_service.dart';
import '../../core/services/file_service.dart';
import '../../core/services/offline_sync_service.dart';

/// Зйомка кількох фото підряд власною камерою: одне підтвердження якості в додатку.
class PhotoCaptureSessionScreen extends StatefulWidget {
  const PhotoCaptureSessionScreen({super.key, required this.taskId});

  final String taskId;

  @override
  State<PhotoCaptureSessionScreen> createState() =>
      _PhotoCaptureSessionScreenState();
}

enum _CaptureView { camera, preview, review }

class _PhotoCaptureSessionScreenState extends State<PhotoCaptureSessionScreen>
    with WidgetsBindingObserver {
  final _accepted = <File>[];
  File? _pending;
  CameraController? _controller;
  bool _cameraReady = false;
  bool _shooting = false;
  bool _uploading = false;
  String? _error;
  _CaptureView _view = _CaptureView.camera;
  late final Directory _sessionDir;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_prepare());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    final controller = _controller;
    _controller = null;
    controller?.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused) {
      final controller = _controller;
      _controller = null;
      _cameraReady = false;
      controller?.dispose();
    } else if (state == AppLifecycleState.resumed) {
      if (_controller == null) {
        unawaited(_initCamera());
      }
    }
  }

  Future<void> _prepare() async {
    final root = await getTemporaryDirectory();
    _sessionDir = Directory(
      '${root.path}/photo_session/${widget.taskId}/${DateTime.now().millisecondsSinceEpoch}',
    );
    await _sessionDir.create(recursive: true);
    if (!mounted) return;
    await _initCamera();
  }

  Future<void> _initCamera() async {
    final status = await Permission.camera.request();
    if (!mounted) return;
    if (!status.isGranted) {
      setState(() {
        _error = 'Немає доступу до камери';
        _cameraReady = false;
      });
      return;
    }
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        if (!mounted) return;
        setState(() => _error = 'Камеру не знайдено');
        return;
      }
      final back = cameras.firstWhere(
        (camera) => camera.lensDirection == CameraLensDirection.back,
        orElse: () => cameras.first,
      );
      final controller = CameraController(
        back,
        ResolutionPreset.high,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );
      await controller.initialize();
      if (!mounted) {
        await controller.dispose();
        return;
      }
      await _controller?.dispose();
      setState(() {
        _controller = controller;
        _cameraReady = true;
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.toString();
        _cameraReady = false;
      });
    }
  }

  Future<void> _capture() async {
    final controller = _controller;
    if (controller == null ||
        !controller.value.isInitialized ||
        controller.value.isTakingPicture ||
        _shooting ||
        _uploading) {
      return;
    }
    setState(() {
      _shooting = true;
      _error = null;
    });
    try {
      final shot = await controller.takePicture();
      final dest = File(
        '${_sessionDir.path}/${DateTime.now().millisecondsSinceEpoch}.jpg',
      );
      try {
        await File(shot.path).copy(dest.path);
      } catch (_) {
        await dest.writeAsBytes(await shot.readAsBytes(), flush: true);
      }
      if (!mounted) return;
      setState(() {
        _pending = dest;
        _shooting = false;
        _view = _CaptureView.preview;
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
      _view = _CaptureView.camera;
    });
  }

  void _retakePending() {
    final file = _pending;
    setState(() {
      _pending = null;
      _view = _CaptureView.camera;
    });
    if (file != null) {
      try {
        file.deleteSync();
      } catch (_) {}
    }
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

  String get _title {
    if (_view == _CaptureView.preview) return 'Перевірте якість';
    return 'Фото (${_accepted.length})';
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
          title: Text(_title),
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
    if (_view == _CaptureView.preview && _pending != null) {
      return _buildPreview(_pending!);
    }
    if (_view == _CaptureView.review) {
      return _buildReview();
    }
    return _buildCamera();
  }

  Widget _buildCamera() {
    final controller = _controller;
    if (_error != null && !_cameraReady) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.redAccent),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _initCamera,
                child: const Text('Спробувати знову'),
              ),
            ],
          ),
        ),
      );
    }
    if (controller == null || !controller.value.isInitialized) {
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
    return Stack(
      fit: StackFit.expand,
      children: [
        FittedBox(
          fit: BoxFit.cover,
          child: SizedBox(
            width: controller.value.previewSize?.height ?? 1,
            height: controller.value.previewSize?.width ?? 1,
            child: CameraPreview(controller),
          ),
        ),
        Align(
          alignment: Alignment.bottomCenter,
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Підтверджено: ${_accepted.length}',
                    style: const TextStyle(color: Colors.white70),
                  ),
                  const SizedBox(height: 16),
                  GestureDetector(
                    onTap: _shooting ? null : _capture,
                    child: Container(
                      width: 76,
                      height: 76,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white, width: 4),
                        color: _shooting ? Colors.white38 : Colors.white24,
                      ),
                      child: _shooting
                          ? const Padding(
                              padding: EdgeInsets.all(22),
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : null,
                    ),
                  ),
                  if (_accepted.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: () =>
                          setState(() => _view = _CaptureView.review),
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
        ),
      ],
    );
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
                    onPressed: () => setState(() {
                      _pending = null;
                      _view = _CaptureView.review;
                    }),
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
                    onPressed: () => setState(() => _view = _CaptureView.camera),
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
