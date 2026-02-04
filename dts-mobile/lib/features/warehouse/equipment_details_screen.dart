import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/models/equipment.dart';
import '../../core/models/warehouse.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/equipment_service.dart';
import '../../core/services/warehouse_service.dart';
import 'batch_move_ship_screen.dart';

class EquipmentDetailsScreen extends StatefulWidget {
  const EquipmentDetailsScreen({super.key, required this.equipmentId});

  static const routeName = '/warehouse/equipment-details';

  final String equipmentId;

  @override
  State<EquipmentDetailsScreen> createState() => _EquipmentDetailsScreenState();
}

class _EquipmentDetailsScreenState extends State<EquipmentDetailsScreen> {
  Equipment? _equipment;
  bool _loading = true;
  String? _error;
  List<Warehouse> _warehouses = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await EquipmentService.instance.fetchEquipmentById(widget.equipmentId);
      final warehouses = await WarehouseService.instance.fetchWarehouses();
      if (!mounted) return;
      setState(() {
        _equipment = Equipment.fromJson(data);
        _warehouses = warehouses;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = AuthService.parseError(e);
      });
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  String _fmt(dynamic v) {
    if (v == null || v == '') return '—';
    return v.toString();
  }

  String _statusLabel(String? s) {
    if (s == null) return '—';
    switch (s) {
      case 'in_stock':
        return 'На складі';
      case 'reserved':
        return 'Зарезервовано';
      case 'shipped':
        return 'Відвантажено';
      case 'in_transit':
        return 'В дорозі';
      case 'written_off':
        return 'Списано';
      case 'deleted':
        return 'Видалено';
      default:
        return s;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return Scaffold(
        appBar: AppBar(title: const Text('Деталі обладнання')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }
    if (_error != null || _equipment == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Деталі обладнання')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(_error ?? 'Обладнання не знайдено'),
          ),
        ),
      );
    }

    final eq = _equipment!;
    final canMoveOrShip = eq.status == 'in_stock' || eq.status == 'reserved';

    return Scaffold(
      appBar: AppBar(
        title: Text(eq.serialNumber?.isNotEmpty == true ? eq.serialNumber! : (eq.type ?? 'Обладнання')),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _section('Основна інформація', [
              _row('Виробник', _fmt(eq.manufacturer)),
              _row('Тип обладнання', _fmt(eq.type)),
              _row('Серійний номер', _fmt(eq.serialNumber)),
              _row('Склад', _fmt(eq.currentWarehouseName ?? eq.currentWarehouse)),
              _row('Статус', _statusLabel(eq.status)),
              if (eq.quantity != null && eq.quantity! > 1) _row('Кількість', eq.quantity.toString()),
            ]),
            _section('Технічні характеристики', [
              _row('Резервна потужність', _fmt(eq.standbyPower)),
              _row('Основна потужність', _fmt(eq.primePower)),
              _row('Фази', _fmt(eq.phase)),
              _row('Напруга', _fmt(eq.voltage)),
              _row('Струм (A)', _fmt(eq.amperage)),
              _row('RPM', _fmt(eq.rpm)),
            ]),
            _section('Фізичні параметри', [
              _row('Розміри (мм)', _fmt(eq.dimensions)),
              _row('Вага (кг)', _fmt(eq.weight)),
              _row('Дата виробництва', _fmt(eq.manufactureDate)),
            ]),
            if (_fmt(eq.region) != '—') _section('Додатково', [_row('Регіон', _fmt(eq.region))]),
            if (eq.notes != null && eq.notes!.isNotEmpty) _section('Примітки', [_row('Примітки', eq.notes!)]),
            if (eq.attachedFiles != null && eq.attachedFiles!.isNotEmpty) ...[
              const SizedBox(height: 16),
              Text('Документи та фото (${eq.attachedFiles!.length})', style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: eq.attachedFiles!.map((f) {
                  final isImage = f.mimetype?.startsWith('image/') == true;
                  return InkWell(
                    onTap: () {
                      final url = f.cloudinaryUrl;
                      if (url != null && url.isNotEmpty) {
                        launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
                      }
                    },
                    child: Container(
                      width: 100,
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        border: Border.all(color: Theme.of(context).dividerColor),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(isImage ? Icons.image : Icons.description, size: 40),
                          const SizedBox(height: 4),
                          Text(
                            f.originalName ?? 'Файл',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              ),
            ],
            const SizedBox(height: 24),
            if (canMoveOrShip)
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _openMove(eq),
                      icon: const Icon(Icons.swap_horiz),
                      label: const Text('Перемістити'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _openShip(eq),
                      icon: const Icon(Icons.local_shipping),
                      label: const Text('Відвантажити'),
                    ),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Widget _section(String title, List<Widget> rows) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          ...rows,
        ],
      ),
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 140, child: Text('$label:', style: TextStyle(color: Theme.of(context).hintColor))),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }

  Future<void> _openMove(Equipment eq) async {
    if (eq.batchId != null && (eq.serialNumber == null || eq.serialNumber!.isEmpty)) {
      final ok = await Navigator.of(context).push<bool>(
        MaterialPageRoute(builder: (_) => BatchMoveShipScreen(equipment: eq)),
      );
      if (ok == true) _load();
      return;
    }
    final toWarehouseId = ValueNotifier<String?>(null);
    final reasonController = TextEditingController();
    final notesController = TextEditingController();

    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('Перемістити'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ValueListenableBuilder<String?>(
                  valueListenable: toWarehouseId,
                  builder: (_, value, __) {
                    return DropdownButtonFormField<String>(
                      value: value,
                      items: _warehouses
                          .where((w) => w.id != eq.currentWarehouse)
                          .map((w) => DropdownMenuItem(value: w.id, child: Text(w.name)))
                          .toList(),
                      onChanged: (v) => toWarehouseId.value = v,
                      decoration: const InputDecoration(labelText: 'Склад призначення'),
                    );
                  },
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: reasonController,
                  decoration: const InputDecoration(labelText: 'Причина'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: notesController,
                  decoration: const InputDecoration(labelText: 'Примітки'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Скасувати')),
            ElevatedButton(onPressed: () => Navigator.pop(context, true), child: const Text('Підтвердити')),
          ],
        );
      },
    );

    if (result != true) return;
    Warehouse? wh;
    try {
      wh = _warehouses.firstWhere((w) => w.id == toWarehouseId.value);
    } catch (_) {
      wh = null;
    }
    if (wh == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Оберіть склад призначення')));
      return;
    }
    try {
      await EquipmentService.instance.moveEquipment(
        equipmentId: eq.id,
        toWarehouseId: wh.id,
        toWarehouseName: wh.name,
        reason: reasonController.text.trim(),
        notes: notesController.text.trim(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Переміщення створено')));
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(AuthService.parseError(e))));
    }
  }

  Future<void> _openShip(Equipment eq) async {
    if (eq.batchId != null && (eq.serialNumber == null || eq.serialNumber!.isEmpty)) {
      final ok = await Navigator.of(context).push<bool>(
        MaterialPageRoute(builder: (_) => BatchMoveShipScreen(equipment: eq)),
      );
      if (ok == true) _load();
      return;
    }
    final shippedToController = TextEditingController();
    final orderController = TextEditingController();
    final notesController = TextEditingController();

    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          title: const Text('Відвантажити'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: shippedToController,
                  decoration: const InputDecoration(labelText: 'Кому відвантажуємо *'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: orderController,
                  decoration: const InputDecoration(labelText: 'Номер замовлення'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: notesController,
                  decoration: const InputDecoration(labelText: 'Примітки'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Скасувати')),
            ElevatedButton(onPressed: () => Navigator.pop(context, true), child: const Text('Підтвердити')),
          ],
        );
      },
    );

    if (result != true) return;
    if (shippedToController.text.trim().isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Вкажіть отримувача')));
      return;
    }
    try {
      await EquipmentService.instance.shipEquipment(
        equipmentId: eq.id,
        shippedTo: shippedToController.text.trim(),
        orderNumber: orderController.text.trim().isEmpty ? null : orderController.text.trim(),
        notes: notesController.text.trim().isEmpty ? null : notesController.text.trim(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Відвантаження створено')));
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(AuthService.parseError(e))));
    }
  }
}
