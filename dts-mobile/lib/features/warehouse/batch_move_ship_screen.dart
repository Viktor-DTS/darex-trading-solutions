import 'package:flutter/material.dart';

import '../../core/models/equipment.dart';
import '../../core/models/warehouse.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/equipment_service.dart';
import '../../core/services/warehouse_service.dart';

class BatchMoveShipScreen extends StatefulWidget {
  const BatchMoveShipScreen({
    super.key,
    required this.equipment,
  });

  final Equipment equipment;

  @override
  State<BatchMoveShipScreen> createState() => _BatchMoveShipScreenState();
}

class _BatchMoveShipScreenState extends State<BatchMoveShipScreen> {
  bool _loading = false;
  String? _error;
  List<Warehouse> _warehouses = [];
  Warehouse? _selectedWarehouse;

  final _quantityController = TextEditingController(text: '1');
  final _reasonController = TextEditingController();
  final _notesController = TextEditingController();
  final _shippedToController = TextEditingController();
  final _orderController = TextEditingController();
  final _invoiceController = TextEditingController();
  final _edrpouController = TextEditingController();
  final _addressController = TextEditingController();
  final _recipientDetailsController = TextEditingController();

  bool _isMove = true;

  @override
  void initState() {
    super.initState();
    _loadWarehouses();
  }

  @override
  void dispose() {
    _quantityController.dispose();
    _reasonController.dispose();
    _notesController.dispose();
    _shippedToController.dispose();
    _orderController.dispose();
    _invoiceController.dispose();
    _edrpouController.dispose();
    _addressController.dispose();
    _recipientDetailsController.dispose();
    super.dispose();
  }

  Future<void> _loadWarehouses() async {
    try {
      final warehouses = await WarehouseService.instance.fetchWarehouses();
      setState(() {
        _warehouses = warehouses;
      });
    } catch (_) {}
  }

  Future<void> _submit() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final quantity = int.tryParse(_quantityController.text.trim()) ?? 1;
      if (quantity < 1) {
        throw 'Кількість повинна бути більше 0';
      }
      if (_isMove && _selectedWarehouse == null) {
        throw 'Оберіть склад призначення';
      }
      if (!_isMove && _shippedToController.text.trim().isEmpty) {
        throw 'Вкажіть отримувача';
      }

      final item = widget.equipment;
      if (_isMove) {
        final warehouse = _selectedWarehouse!;
        await EquipmentService.instance.moveBatch(
          batchId: item.batchId ?? '',
          quantity: quantity,
          fromWarehouse: item.currentWarehouse ?? '',
          fromWarehouseName: item.currentWarehouseName ?? '',
          toWarehouse: warehouse.id,
          toWarehouseName: warehouse.name,
          reason: _reasonController.text.trim(),
          notes: _notesController.text.trim(),
        );
      } else {
        await EquipmentService.instance.shipBatch(
          batchId: item.batchId ?? '',
          quantity: quantity,
          fromWarehouse: item.currentWarehouse ?? '',
          shippedTo: _shippedToController.text.trim(),
          orderNumber: _orderController.text.trim(),
          invoiceNumber: _invoiceController.text.trim(),
          clientEdrpou: _edrpouController.text.trim(),
          clientAddress: _addressController.text.trim(),
          invoiceRecipientDetails: _recipientDetailsController.text.trim(),
          notes: _notesController.text.trim(),
        );
      }

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_isMove ? 'Партію переміщено' : 'Партію відвантажено'),
        ),
      );
      Navigator.of(context).pop(true);
    } catch (error) {
      setState(() {
        _error = error is String ? error : AuthService.parseError(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.equipment;
    return Scaffold(
      appBar: AppBar(
        title: Text(item.type ?? 'Партія'),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(
                  _error!,
                  style: TextStyle(color: Colors.red.shade700),
                ),
              ),
            SwitchListTile(
              value: _isMove,
              onChanged: _loading ? null : (value) => setState(() => _isMove = value),
              title: Text(_isMove ? 'Переміщення партії' : 'Відвантаження партії'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _quantityController,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(
                labelText: 'Кількість (доступно ${item.quantity ?? 1})',
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            if (_isMove)
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
                onChanged: _loading ? null : (value) => setState(() => _selectedWarehouse = value),
                decoration: const InputDecoration(
                  labelText: 'Склад призначення',
                  border: OutlineInputBorder(),
                ),
              ),
            if (!_isMove)
              TextField(
                controller: _shippedToController,
                decoration: const InputDecoration(
                  labelText: 'Кому відвантажуємо',
                  border: OutlineInputBorder(),
                ),
              ),
            const SizedBox(height: 12),
            TextField(
              controller: _orderController,
              decoration: const InputDecoration(
                labelText: 'Номер замовлення',
                border: OutlineInputBorder(),
              ),
            ),
            if (!_isMove) ...[
              const SizedBox(height: 12),
              TextField(
                controller: _invoiceController,
                decoration: const InputDecoration(
                  labelText: 'Номер рахунку',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _edrpouController,
                decoration: const InputDecoration(
                  labelText: 'ЄДРПОУ',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _addressController,
                decoration: const InputDecoration(
                  labelText: 'Адреса клієнта',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _recipientDetailsController,
                maxLines: 2,
                decoration: const InputDecoration(
                  labelText: 'Реквізити отримувача рахунку',
                  border: OutlineInputBorder(),
                ),
              ),
            ],
            const SizedBox(height: 12),
            TextField(
              controller: _reasonController,
              decoration: const InputDecoration(
                labelText: 'Причина/примітки',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _loading ? null : _submit,
              child: _loading
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(_isMove ? 'Перемістити' : 'Відвантажити'),
            ),
          ],
        ),
      ),
    );
  }
}
