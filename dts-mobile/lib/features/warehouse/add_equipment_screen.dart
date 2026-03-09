import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/models/warehouse.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/equipment_service.dart';
import '../../core/services/warehouse_service.dart';
import '../../core/utils/ocr_parser.dart';

class AddEquipmentScreen extends StatefulWidget {
  const AddEquipmentScreen({super.key});

  static const routeName = '/warehouse/add';

  @override
  State<AddEquipmentScreen> createState() => _AddEquipmentScreenState();
}

class _AddEquipmentScreenState extends State<AddEquipmentScreen> {
  bool _isBatch = false;
  bool _saving = false;
  bool _scanning = false;
  String? _error;

  final _typeController = TextEditingController();
  final _serialController = TextEditingController();
  final _manufacturerController = TextEditingController();
  final _batchUnitController = TextEditingController(text: 'шт');
  final _quantityController = TextEditingController(text: '1');

  List<Warehouse> _warehouses = [];
  Warehouse? _selectedWarehouse;

  @override
  void initState() {
    super.initState();
    _loadWarehouses();
  }

  @override
  void dispose() {
    _typeController.dispose();
    _serialController.dispose();
    _manufacturerController.dispose();
    _batchUnitController.dispose();
    _quantityController.dispose();
    super.dispose();
  }

  Future<void> _loadWarehouses() async {
    try {
      final warehouses = await WarehouseService.instance.fetchWarehouses();
      setState(() {
        _warehouses = warehouses;
      });
    } catch (_) {
      // Ignore here; errors handled on submit.
    }
  }

  Future<void> _scanNameplate() async {
    setState(() {
      _scanning = true;
      _error = null;
    });
    try {
      final picker = ImagePicker();
      final xFile = await picker.pickImage(
        source: ImageSource.camera,
        imageQuality: 85,
      );
      if (xFile == null || !mounted) {
        setState(() => _scanning = false);
        return;
      }
      final file = File(xFile.path);
      if (!file.existsSync()) {
        if (!mounted) return;
        setState(() {
          _scanning = false;
          _error = 'Не вдалося зчитати фото';
        });
        return;
      }
      final text = await EquipmentService.instance.ocrFromImage(file);
      if (!mounted) return;
      if (text == null || text.trim().length < 5) {
        setState(() {
          _scanning = false;
          _error = 'Текст з шильдика не розпізнано. Спробуйте ще раз з чітким фото.';
        });
        return;
      }
      final parsed = parseEquipmentData(text);
      setState(() {
        _typeController.text = (parsed['type'] as String?)?.toString().trim() ?? '';
        _serialController.text = (parsed['serialNumber'] as String?)?.toString().trim() ?? '';
        _manufacturerController.text = (parsed['manufacturer'] as String?)?.toString().trim() ?? '';
        _scanning = false;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Дані з шильдика заповнено. Перевірте та збережіть.')),
        );
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _scanning = false;
        _error = AuthService.parseError(e);
      });
    }
  }

  Future<void> _submit() async {
    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      final type = _typeController.text.trim();
      final serial = _serialController.text.trim();
      final batchUnit = _batchUnitController.text.trim();
      final quantity = int.tryParse(_quantityController.text.trim()) ?? 1;

      if (type.isEmpty) {
        throw 'Вкажіть тип обладнання';
      }
      if (!_isBatch && serial.isEmpty) {
        throw 'Серійний номер обовʼязковий для одиничного обладнання';
      }
      if (batchUnit.isEmpty) {
        throw 'Вкажіть одиницю виміру';
      }
      if (_isBatch && quantity < 1) {
        throw 'Кількість повинна бути більше 0';
      }

      final warehouse = _selectedWarehouse;
      final payload = {
        'type': type,
        'serialNumber': _isBatch ? '' : serial,
        'manufacturer': _manufacturerController.text.trim(),
        'batchUnit': batchUnit,
        'quantity': quantity,
        'isBatch': _isBatch,
        if (warehouse != null) 'currentWarehouse': warehouse.id,
        if (warehouse != null) 'currentWarehouseName': warehouse.name,
        if (AuthService.instance.region != null)
          'region': AuthService.instance.region,
      };

      await EquipmentService.instance.scanEquipment(payload);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Обладнання додано')),
      );
      Navigator.of(context).pop(true);
    } catch (error) {
      setState(() {
        _error = error is String ? error : AuthService.parseError(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Додати обладнання'),
        actions: [
          IconButton(
            onPressed: (_saving || _scanning) ? null : _scanNameplate,
            icon: _scanning
                ? const SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.document_scanner),
            tooltip: 'Сканувати шильдик',
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            OutlinedButton.icon(
              onPressed: (_saving || _scanning) ? null : _scanNameplate,
              icon: const Icon(Icons.camera_alt),
              label: Text(_scanning ? 'Розпізнавання...' : 'Сканувати шильдик камерою'),
            ),
            const SizedBox(height: 16),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(
                  _error!,
                  style: TextStyle(color: Colors.red.shade700),
                ),
              ),
            SwitchListTile(
              value: _isBatch,
              onChanged: _saving
                  ? null
                  : (value) {
                      setState(() => _isBatch = value);
                    },
              title: const Text('Партія (без серійного номера)'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _typeController,
              decoration: const InputDecoration(
                labelText: 'Тип обладнання',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            if (!_isBatch)
              TextField(
                controller: _serialController,
                decoration: const InputDecoration(
                  labelText: 'Серійний номер',
                  border: OutlineInputBorder(),
                ),
              ),
            if (!_isBatch) const SizedBox(height: 12),
            TextField(
              controller: _manufacturerController,
              decoration: const InputDecoration(
                labelText: 'Виробник (опціонально)',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _batchUnitController,
              decoration: const InputDecoration(
                labelText: 'Одиниця виміру',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            if (_isBatch)
              TextField(
                controller: _quantityController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Кількість',
                  border: OutlineInputBorder(),
                ),
              ),
            if (_isBatch) const SizedBox(height: 12),
            DropdownButtonFormField<Warehouse>(
              value: _selectedWarehouse,
              items: _warehouses
                  .map(
                    (w) => DropdownMenuItem(
                      value: w,
                      child: Text(w.name),
                    ),
                  )
                  .toList(),
              onChanged: _saving ? null : (value) => setState(() => _selectedWarehouse = value),
              decoration: const InputDecoration(
                labelText: 'Склад',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: _saving ? null : _submit,
              child: _saving
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Зберегти'),
            ),
          ],
        ),
      ),
    );
  }
}
