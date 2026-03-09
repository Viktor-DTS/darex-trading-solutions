import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../core/models/equipment.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/equipment_service.dart';
import 'equipment_details_screen.dart';

/// Витягує ID обладнання з відсканованого QR.
/// Підтримує: URL типу .../equipment/{id} або чистий ID (ObjectId).
String? extractEquipmentId(String raw) {
  final s = raw.trim();
  if (s.isEmpty) return null;
  // .../equipment/507f1f77bcf86cd799439011
  final uriMatch = RegExp(r'/equipment/([a-zA-Z0-9_-]+)').firstMatch(s);
  if (uriMatch != null) return uriMatch.group(1);
  // Чистий ObjectId (24 hex) або серійний номер (цифри)
  if (RegExp(r'^[a-zA-Z0-9_-]{10,}$').hasMatch(s)) return s;
  return null;
}

class QrScannerScreen extends StatefulWidget {
  const QrScannerScreen({super.key});

  static const routeName = '/warehouse/qr-scanner';

  @override
  State<QrScannerScreen> createState() => _QrScannerScreenState();
}

class _QrScannerScreenState extends State<QrScannerScreen> {
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

    final id = extractEquipmentId(raw);
    if (id == null) {
      if (!mounted) return;
      HapticFeedback.heavyImpact();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Невірний формат QR: $raw')),
      );
      return;
    }

    setState(() => _processing = true);
    try {
      final data = await EquipmentService.instance.fetchEquipmentById(id);
      if (!mounted) return;
      final equipment = Equipment.fromJson(data);
      _lastScanned = null;
      HapticFeedback.mediumImpact();
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => EquipmentDetailsScreen(equipmentId: equipment.id),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AuthService.parseError(e))),
      );
      _lastScanned = null;
    } finally {
      if (mounted) setState(() => _processing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Сканувати QR обладнання'),
        actions: [
          IconButton(
            icon: ValueListenableBuilder(
              valueListenable: _controller,
              builder: (_, state, __) {
                switch (state.torchState) {
                  case TorchState.off:
                    return const Icon(Icons.flash_off);
                  case TorchState.on:
                    return const Icon(Icons.flash_on);
                  default:
                    return const Icon(Icons.flash_off);
                }
              },
            ),
            onPressed: () => _controller.toggleTorch(),
          ),
          IconButton(
            icon: ValueListenableBuilder(
              valueListenable: _controller,
              builder: (_, state, __) {
                switch (state.cameraDirection) {
                  case CameraFacing.front:
                    return const Icon(Icons.camera_front);
                  case CameraFacing.back:
                    return const Icon(Icons.camera_rear);
                  default:
                    return const Icon(Icons.cameraswitch);
                }
              },
            ),
            onPressed: () => _controller.switchCamera(),
          ),
        ],
      ),
      body: Stack(
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: _onDetect,
          ),
          if (_processing)
            Container(
              color: Colors.black54,
              child: const Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircularProgressIndicator(color: Colors.white),
                    SizedBox(height: 16),
                    Text(
                      'Завантаження обладнання...',
                      style: TextStyle(color: Colors.white, fontSize: 16),
                    ),
                  ],
                ),
              ),
            )
          else
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 260,
                    height: 260,
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.white54, width: 2),
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Наведіть камеру на QR-код обладнання',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.white70,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
