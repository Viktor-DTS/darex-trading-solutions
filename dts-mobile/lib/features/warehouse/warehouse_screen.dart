import 'package:flutter/material.dart';

import '../../core/models/equipment.dart';
import '../../core/models/movement_document.dart';
import '../../core/models/shipment_document.dart';
import '../../core/models/warehouse.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/equipment_service.dart';
import '../../core/services/document_service.dart';
import '../../core/services/warehouse_service.dart';
import 'add_equipment_screen.dart';
import 'batch_move_ship_screen.dart';
import 'document_details_screen.dart';

class WarehouseScreen extends StatefulWidget {
  const WarehouseScreen({super.key});

  static const routeName = '/warehouse';

  @override
  State<WarehouseScreen> createState() => _WarehouseScreenState();
}

class _WarehouseScreenState extends State<WarehouseScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  bool _loading = false;
  String? _error;
  List<Equipment> _equipment = [];
  List<Equipment> _inTransit = [];
  List<Warehouse> _warehouses = [];
  final Set<String> _selectedInTransit = {};
  List<MovementDocument> _movementDocs = [];
  List<ShipmentDocument> _shipmentDocs = [];
  bool _docsLoading = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadEquipment();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadEquipment() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final equipment = await EquipmentService.instance.fetchEquipment();
      final inTransit =
          await EquipmentService.instance.fetchEquipment(status: 'in_transit');
      final warehouses = await WarehouseService.instance.fetchWarehouses();
      await _loadDocuments();
      setState(() {
        _equipment = equipment;
        _inTransit = inTransit;
        _warehouses = warehouses;
      });
    } catch (error) {
      setState(() {
        _error = AuthService.parseError(error);
      });
    } finally {
      setState(() {
        _loading = false;
      });
    }
  }

  Future<void> _loadDocuments() async {
    setState(() {
      _docsLoading = true;
    });
    try {
      final movementDocs =
          await DocumentService.instance.fetchMovementDocuments();
      final shipmentDocs =
          await DocumentService.instance.fetchShipmentDocuments();
      setState(() {
        _movementDocs = movementDocs;
        _shipmentDocs = shipmentDocs;
      });
    } finally {
      setState(() {
        _docsLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Складський облік'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'Обладнання'),
            Tab(text: 'В дорозі'),
            Tab(text: 'Документи'),
          ],
        ),
        actions: [
          IconButton(
            onPressed: _loadEquipment,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildEquipmentList(),
          _buildInTransitList(),
          _buildDocuments(),
        ],
      ),
      floatingActionButton: _tabController.index == 0
          ? FloatingActionButton(
              onPressed: () async {
                final result = await Navigator.of(context).push<bool>(
                  MaterialPageRoute(
                    builder: (_) => const AddEquipmentScreen(),
                  ),
                );
                if (result == true) {
                  _loadEquipment();
                }
              },
              child: const Icon(Icons.add),
            )
          : null,
    );
  }

  Widget _buildEquipmentList() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(child: Text(_error!));
    }
    if (_equipment.isEmpty) {
      return const Center(child: Text('Немає обладнання'));
    }

    return ListView.separated(
      itemCount: _equipment.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final item = _equipment[index];
        return ListTile(
          title: Text(item.type ?? 'Обладнання'),
          subtitle: Text(
            [
              item.serialNumber ?? 'Серійний номер не вказано',
              item.currentWarehouseName ?? 'Склад не вказано',
            ].join(' · '),
          ),
          trailing: _buildActions(item),
          onTap: () {
            // TODO: details / actions (move, ship, write-off).
          },
        );
      },
    );
  }

  Widget _buildActions(Equipment item) {
    final status = item.status ?? '';
    if (status == 'in_transit' || status == 'shipped' || status == 'written_off') {
      return Text(status);
    }

    return PopupMenuButton<String>(
      onSelected: (value) {
        if (value == 'move') {
          if (item.batchId != null && (item.serialNumber == null || item.serialNumber!.isEmpty)) {
            _openBatchMoveShip(item, isMove: true);
          } else {
            _showMoveDialog(item);
          }
        } else if (value == 'ship') {
          if (item.batchId != null && (item.serialNumber == null || item.serialNumber!.isEmpty)) {
            _openBatchMoveShip(item, isMove: false);
          } else {
            _showShipDialog(item);
          }
        }
      },
      itemBuilder: (context) => [
        const PopupMenuItem(
          value: 'move',
          child: Text('Перемістити'),
        ),
        const PopupMenuItem(
          value: 'ship',
          child: Text('Відвантажити'),
        ),
      ],
      child: Text(status.isEmpty ? 'Дія' : status),
    );
  }

  Widget _buildInTransitList() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(child: Text(_error!));
    }
    if (_inTransit.isEmpty) {
      return const Center(child: Text('Немає обладнання в дорозі'));
    }

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: Text('Вибрано: ${_selectedInTransit.length}'),
              ),
              ElevatedButton(
                onPressed: _selectedInTransit.isEmpty ? null : _approveReceipt,
                child: const Text('Підтвердити'),
              ),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(
          child: ListView.separated(
            itemCount: _inTransit.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (context, index) {
              final item = _inTransit[index];
              final isSelected = _selectedInTransit.contains(item.id);
              return ListTile(
                leading: Checkbox(
                  value: isSelected,
                  onChanged: (value) {
                    setState(() {
                      if (value == true) {
                        _selectedInTransit.add(item.id);
                      } else {
                        _selectedInTransit.remove(item.id);
                      }
                    });
                  },
                ),
                title: Text(item.type ?? 'Обладнання'),
                subtitle: Text(
                  item.serialNumber ?? 'Серійний номер не вказано',
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildDocuments() {
    if (_docsLoading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_movementDocs.isEmpty && _shipmentDocs.isEmpty) {
      return const Center(child: Text('Немає документів'));
    }

    return ListView(
      children: [
        if (_movementDocs.isNotEmpty)
          _buildDocSection(
            title: 'Переміщення',
            children: _movementDocs
                .map(
                  (doc) => ListTile(
                    title: Text(doc.documentNumber),
                    subtitle: Text(
                      '${doc.fromWarehouseName ?? '—'} → ${doc.toWarehouseName ?? '—'}',
                    ),
                    trailing: Text(doc.status ?? ''),
                          onTap: () {
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => DocumentDetailsScreen.movement(
                                  document: doc,
                                ),
                              ),
                            );
                          },
                  ),
                )
                .toList(),
          ),
        if (_shipmentDocs.isNotEmpty)
          _buildDocSection(
            title: 'Відвантаження',
            children: _shipmentDocs
                .map(
                  (doc) => ListTile(
                    title: Text(doc.documentNumber),
                    subtitle: Text(doc.shippedTo ?? '—'),
                    trailing: Text(doc.status ?? ''),
                          onTap: () {
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => DocumentDetailsScreen.shipment(
                                  shipmentDocument: doc,
                                ),
                              ),
                            );
                          },
                  ),
                )
                .toList(),
          ),
      ],
    );
  }

  Widget _buildDocSection({
    required String title,
    required List<Widget> children,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: 8),
          ...children,
        ],
      ),
    );
  }

  Future<void> _approveReceipt() async {
    try {
      await EquipmentService.instance.approveReceipt(
        _selectedInTransit.toList(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Отримання підтверджено')),
      );
      _selectedInTransit.clear();
      _loadEquipment();
    } catch (error) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AuthService.parseError(error))),
      );
    }
  }

  Future<void> _showMoveDialog(Equipment item) async {
    final toWarehouseId = ValueNotifier<String?>(null);
    final reasonController = TextEditingController();
    final notesController = TextEditingController();

    final result = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Перемістити'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ValueListenableBuilder<String?>(
                valueListenable: toWarehouseId,
                builder: (context, value, _) {
                  return DropdownButtonFormField<String>(
                    value: value,
                    items: _warehouses
                        .map(
                          (w) => DropdownMenuItem(
                            value: w.id,
                            child: Text(w.name),
                          ),
                        )
                        .toList(),
                    onChanged: (val) => toWarehouseId.value = val,
                    decoration: const InputDecoration(
                      labelText: 'Склад призначення',
                    ),
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
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Скасувати'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Підтвердити'),
            ),
          ],
        );
      },
    );

    if (result == true) {
      final warehouse = _warehouses.firstWhere(
        (w) => w.id == toWarehouseId.value,
        orElse: () => Warehouse(id: '', name: ''),
      );
      if (warehouse.id.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Оберіть склад призначення')),
        );
        return;
      }
      await EquipmentService.instance.moveEquipment(
        equipmentId: item.id,
        toWarehouseId: warehouse.id,
        toWarehouseName: warehouse.name,
        reason: reasonController.text.trim(),
        notes: notesController.text.trim(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Переміщення створено')),
      );
      _loadEquipment();
    }
  }

  Future<void> _showShipDialog(Equipment item) async {
    final shippedToController = TextEditingController();
    final orderController = TextEditingController();
    final notesController = TextEditingController();

    final result = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Відвантажити'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: shippedToController,
                decoration: const InputDecoration(labelText: 'Кому відвантажуємо'),
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
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Скасувати'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Підтвердити'),
            ),
          ],
        );
      },
    );

    if (result == true) {
      if (shippedToController.text.trim().isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Вкажіть отримувача')),
        );
        return;
      }
      await EquipmentService.instance.shipEquipment(
        equipmentId: item.id,
        shippedTo: shippedToController.text.trim(),
        orderNumber: orderController.text.trim(),
        notes: notesController.text.trim(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Відвантаження створено')),
      );
      _loadEquipment();
    }
  }

  Future<void> _openBatchMoveShip(Equipment item, {required bool isMove}) async {
    final result = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => BatchMoveShipScreen(equipment: item),
      ),
    );
    if (result == true) {
      _loadEquipment();
    }
  }
}
