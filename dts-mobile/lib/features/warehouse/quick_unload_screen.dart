import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../core/models/equipment.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/equipment_service.dart';
import '../../core/widgets/error_with_retry.dart';

/// Швидке розвантаження: скан кількох QR → підтвердити отримання одним натисканням.
class QuickUnloadScreen extends StatefulWidget {
  const QuickUnloadScreen({super.key});

  static const routeName = '/warehouse/quick-unload';

  @override
  State<QuickUnloadScreen> createState() => _QuickUnloadScreenState();
}

class _QuickUnloadScreenState extends State<QuickUnloadScreen> {
  final List<Equipment> _scannedItems = [];
  bool _approving = false;
  String? _error;

  Future<void> _openScanner() async {
    final result = await Navigator.of(context).push<Equipment>(
      MaterialPageRoute(
        builder: (_) => const _BatchQrScanner(),
      ),
    );
    if (result != null && mounted) {
      final exists = _scannedItems.any((e) => e.id == result.id);
      if (!exists) {
        if (result.status != 'in_transit') {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('${result.type ?? result.serialNumber} не в дорозі — пропущено'),
            ),
          );
          return;
        }
        setState(() {
          _scannedItems.add(result);
          HapticFeedback.mediumImpact();
        });
      }
    }
  }

  Future<void> _approveAll() async {
    if (_scannedItems.isEmpty) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Підтвердити отримання'),
        content: Text(
          'Підтвердити отримання ${_scannedItems.length} одиниць на склад?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Скасувати'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Підтвердити'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() {
      _approving = true;
      _error = null;
    });
    try {
      await EquipmentService.instance.approveReceipt(
        _scannedItems.map((e) => e.id).toList(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Отримання ${_scannedItems.length} одиниць підтверджено')),
      );
      setState(() {
        _scannedItems.clear();
        _approving = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = AuthService.parseError(e);
        _approving = false;
      });
    }
  }

  void _removeItem(Equipment e) {
    setState(() => _scannedItems.removeWhere((x) => x.id == e.id));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Швидке розвантаження'),
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.info_outline, color: Theme.of(context).colorScheme.primary),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Скануйте QR обладнання в дорозі. Потім одним натисканням підтвердьте отримання.',
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: ErrorWithRetry(
                message: _error!,
                onRetry: () => setState(() => _error = null),
              ),
            )
          else ...[
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                'Відскановано: ${_scannedItems.length}',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: _scannedItems.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.qr_code_scanner, size: 64, color: Theme.of(context).colorScheme.outline),
                          const SizedBox(height: 16),
                          Text(
                            'Натисніть + щоб сканувати',
                            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                                  color: Theme.of(context).colorScheme.outline,
                                ),
                          ),
                        ],
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: _scannedItems.length,
                      itemBuilder: (_, i) {
                        final item = _scannedItems[i];
                        return Card(
                          margin: const EdgeInsets.only(bottom: 8),
                          child: ListTile(
                            title: Text(item.type ?? 'Обладнання'),
                            subtitle: Text(
                              item.serialNumber?.isNotEmpty == true
                                  ? item.serialNumber!
                                  : 'Партія: ${item.batchId ?? "—"}',
                            ),
                            trailing: IconButton(
                              icon: const Icon(Icons.remove_circle_outline),
                              onPressed: () => _removeItem(item),
                            ),
                          ),
                        );
                      },
                    ),
            ),
            if (_scannedItems.isNotEmpty)
              SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: FilledButton.icon(
                    onPressed: _approving ? null : _approveAll,
                    icon: _approving
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.check_circle_outline),
                    label: Text(_approving ? 'Зачекайте...' : 'Підтвердити отримання (${_scannedItems.length})'),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(double.infinity, 48),
                    ),
                  ),
                ),
              ),
          ],
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _approving ? null : _openScanner,
        icon: const Icon(Icons.add),
        label: const Text('Сканувати'),
      ),
    );
  }
}

/// Сканер, який повертає обладнання замість переходу до деталей.
class _BatchQrScanner extends StatefulWidget {
  const _BatchQrScanner();

  @override
  State<_BatchQrScanner> createState() => _BatchQrScannerState();
}

class _BatchQrScannerState extends State<_BatchQrScanner> {
  final MobileScannerController _controller = MobileScannerController();
  bool _processing = false;
  String? _lastScanned;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_processing) return;
    final codes = capture.barcodes;
    if (codes.isEmpty) return;
    final raw = codes.first.rawValue;
    if (raw == null || raw.isEmpty) return;
    if (_lastScanned == raw) return;
    _lastScanned = raw;

    final id = _extractId(raw);
    if (id == null) {
      if (!mounted) return;
      HapticFeedback.heavyImpact();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Невірний QR: $raw')));
      return;
    }

    setState(() => _processing = true);
    try {
      final data = await EquipmentService.instance.fetchEquipmentById(id);
      if (!mounted) return;
      final equipment = Equipment.fromJson(data);
      _lastScanned = null;
      HapticFeedback.mediumImpact();
      Navigator.of(context).pop(equipment);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(AuthService.parseError(e))));
      _lastScanned = null;
    } finally {
      if (mounted) setState(() => _processing = false);
    }
  }

  String? _extractId(String raw) {
    final s = raw.trim();
    if (s.isEmpty) return null;
    final uriMatch = RegExp(r'/equipment/([a-zA-Z0-9_-]+)').firstMatch(s);
    if (uriMatch != null) return uriMatch.group(1);
    if (RegExp(r'^[a-zA-Z0-9_-]{10,}$').hasMatch(s)) return s;
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Сканувати для списку')),
      body: Stack(
        children: [
          MobileScanner(controller: _controller, onDetect: _onDetect),
          if (_processing)
            Container(
              color: Colors.black54,
              child: const Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircularProgressIndicator(color: Colors.white),
                    SizedBox(height: 16),
                    Text('Завантаження...', style: TextStyle(color: Colors.white)),
                  ],
                ),
              ),
            )
          else
            const Center(
              child: Text(
                'Наведіть камеру на QR',
                style: TextStyle(color: Colors.white70),
              ),
            ),
        ],
      ),
    );
  }
}
