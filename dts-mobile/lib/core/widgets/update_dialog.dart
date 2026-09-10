import 'package:flutter/material.dart';

import '../services/app_update_service.dart';

Future<void> showAppUpdateDialog(BuildContext context, AppUpdateResult result) {
  return showDialog<void>(
    context: context,
    barrierDismissible: !result.forceUpdate,
    builder: (_) => AppUpdateDialog(result: result),
  );
}

class AppUpdateDialog extends StatefulWidget {
  const AppUpdateDialog({super.key, required this.result});

  final AppUpdateResult result;

  @override
  State<AppUpdateDialog> createState() => _AppUpdateDialogState();
}

class _AppUpdateDialogState extends State<AppUpdateDialog> {
  bool _busy = false;
  double? _progress;
  String? _error;

  Future<void> _install() async {
    setState(() {
      _busy = true;
      _error = null;
      _progress = 0;
    });
    try {
      await AppUpdateService.instance.downloadAndInstall(
        widget.result,
        onProgress: (value) {
          if (mounted) setState(() => _progress = value);
        },
      );
    } catch (e) {
      if (mounted) {
        setState(() => _error = 'Не вдалося завантажити. Спробуйте ще раз.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final result = widget.result;
    final sizeMb = result.fileSize > 0
        ? ' · ${(result.fileSize / (1024 * 1024)).toStringAsFixed(1)} МБ'
        : '';
    return AlertDialog(
      title: const Text('Є оновлення'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            result.forceUpdate
                ? 'Для роботи потрібна версія ${result.latestVersion} (у вас ${result.currentVersion}).'
                : 'Доступна версія ${result.latestVersion} (у вас ${result.currentVersion})$sizeMb.',
          ),
          if (result.changelog.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(result.changelog),
          ],
          if (_busy) ...[
            const SizedBox(height: 16),
            LinearProgressIndicator(value: _progress == 0 ? null : _progress),
            const SizedBox(height: 6),
            Text(
              _progress == null || _progress == 0
                  ? 'Завантаження…'
                  : 'Завантаження ${((_progress ?? 0) * 100).clamp(0, 100).toStringAsFixed(0)}%',
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
        ],
      ),
      actions: [
        if (!result.forceUpdate && !_busy)
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Пізніше'),
          ),
        FilledButton(
          onPressed: _busy ? null : _install,
          child: Text(_busy ? 'Завантаження' : 'Оновити'),
        ),
      ],
    );
  }
}
