import 'package:flutter/material.dart';

import '../../core/models/equipment.dart';
import '../../core/models/warehouse.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/equipment_service.dart';
import '../../core/services/warehouse_service.dart';
import 'manager_equipment_detail_screen.dart';

/// Панель «Менеджери» — як у веб-проекті: залишки на складах + історія резервування.
/// Не показує сервісні заявки (це окрема панель «Сервісна служба»).
class ManagersOverviewScreen extends StatefulWidget {
  const ManagersOverviewScreen({super.key});

  static const routeName = '/managers';

  @override
  State<ManagersOverviewScreen> createState() => _ManagersOverviewScreenState();
}

class _ManagersOverviewScreenState extends State<ManagersOverviewScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  bool _loading = false;
  bool _historyLoading = false;
  String? _error;
  List<Equipment> _equipment = [];
  List<Warehouse> _warehouses = [];
  List<Map<String, dynamic>> _reservationHistory = [];
  String? _selectedWarehouseId;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final equipment = await EquipmentService.instance.fetchEquipment();
      final warehouses = await WarehouseService.instance.fetchWarehouses();
      setState(() {
        _equipment = equipment;
        _warehouses = warehouses;
      });
      if (_tabController.index == 1) {
        _loadReservationHistory();
      }
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

  Future<void> _loadReservationHistory() async {
    setState(() {
      _historyLoading = true;
    });
    try {
      final list =
          await EquipmentService.instance.fetchReservationHistory();
      setState(() {
        _reservationHistory = list;
      });
    } catch (error) {
      setState(() {
        _error = AuthService.parseError(error);
      });
    } finally {
      setState(() {
        _historyLoading = false;
      });
    }
  }

  List<Equipment> get _filteredEquipment {
    // Не показуємо видалене обладнання (як у веб-застосунку).
    var list = _equipment
        .where((e) => e.status != 'deleted' && e.isDeleted != true)
        .toList();
    if (_selectedWarehouseId != null && _selectedWarehouseId!.isNotEmpty) {
      list = list
          .where((e) => e.currentWarehouse == _selectedWarehouseId)
          .toList();
    }
    return list;
  }

  /// Форматує ISO-дату в читабельний вигляд (дд.мм.рррр гг:хх).
  static String? _formatDate(String? value) {
    if (value == null || value.isEmpty) return null;
    final d = DateTime.tryParse(value);
    if (d == null) return value;
    final day = d.day.toString().padLeft(2, '0');
    final month = d.month.toString().padLeft(2, '0');
    final year = d.year;
    final hour = d.hour.toString().padLeft(2, '0');
    final minute = d.minute.toString().padLeft(2, '0');
    return '$day.$month.$year $hour:$minute';
  }

  /// Нормалізований статус тесту (з API може приходити в різному регістрі).
  static String _normalizeTestingStatus(String? status) {
    return (status ?? 'none').toLowerCase().trim();
  }

  /// Обладнання вважається відтестованим, якщо тестування завершено або не пройдено.
  bool _isEquipmentTested(Equipment item) {
    final s = _normalizeTestingStatus(item.testingStatus);
    return s == 'completed' || s == 'failed';
  }

  /// Як у вебі: підпис статусу тестування — усі варіанти (none, requested, in_progress, completed, failed).
  static String _testingStatusLabel(Equipment item) {
    const map = {
      'none': 'Не відтестовано',
      'requested': 'Очікує тестування',
      'in_progress': 'В роботі',
      'completed': 'Відтестовано',
      'failed': 'Не пройшло',
    };
    return map[_normalizeTestingStatus(item.testingStatus)] ?? 'Не відтестовано';
  }

  /// Кнопку «На тест» показуємо активною тільки коли ще не подавали на тест (status none).
  /// Після submitted / in progress / completed / failed — неактивна.
  bool _canRequestTesting(Equipment item) {
    final s = _normalizeTestingStatus(item.testingStatus);
    return s == 'none' || s.isEmpty;
  }

  static Color _testingStatusColor(String status) {
    switch (status) {
      case 'requested':
        return Colors.orange;
      case 'in_progress':
        return Colors.blue;
      case 'completed':
        return Colors.green;
      case 'failed':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  static Widget _buildTestingStatusIcon(BuildContext context, String status) {
    IconData icon;
    final color = _testingStatusColor(status);
    switch (status) {
      case 'requested':
        icon = Icons.schedule;
        break;
      case 'in_progress':
        icon = Icons.autorenew;
        break;
      case 'completed':
        icon = Icons.check_circle;
        break;
      case 'failed':
        icon = Icons.cancel;
        break;
      default:
        icon = Icons.pending_outlined;
    }
    return Icon(icon, size: 14, color: color);
  }

  /// Як у вебі: статус на складі — українською (На складі, Зарезервовано, Відвантажено тощо).
  static String _statusLabel(String? status) {
    const map = {
      'in_stock': 'На складі',
      'reserved': 'На складі',
      'shipped': 'Відвантажено',
      'in_transit': 'В дорозі',
      'written_off': 'Списано',
      'deleted': 'Видалено',
    };
    return map[status ?? ''] ?? (status ?? 'На складі');
  }

  /// Як у вебі: статус резерву — «Зарезервовано» або «Вільна».
  static String _reservationLabel(Equipment item) {
    if (item.status == 'reserved' ||
        (item.reservedByName != null && item.reservedByName!.isNotEmpty) ||
        (item.reservationClientName != null && item.reservationClientName!.isNotEmpty)) {
      return 'Зарезервовано';
    }
    return 'Вільна';
  }

  void _openDetail(Equipment item) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ManagerEquipmentDetailScreen(equipment: item),
      ),
    ).then((_) {
      _loadData();
    });
  }

  Future<void> _showReserveDialog(Equipment item) async {
    final clientController = TextEditingController();
    final notesController = TextEditingController();
    DateTime? endDate;
    final result = await showDialog<bool>(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: const Text('Резервування обладнання'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${item.type ?? "Обладнання"} · ${item.serialNumber ?? "—"}',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: clientController,
                      decoration: const InputDecoration(
                        labelText: 'Назва клієнта *',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: notesController,
                      maxLines: 2,
                      decoration: const InputDecoration(
                        labelText: 'Примітки',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    ListTile(
                      title: Text(
                        endDate == null
                            ? 'Дата закінчення резерву'
                            : 'До: ${endDate!.toIso8601String().split('T').first}',
                      ),
                      trailing: const Icon(Icons.calendar_today),
                      onTap: () async {
                        final picked = await showDatePicker(
                          context: context,
                          firstDate: DateTime.now(),
                          lastDate: DateTime.now()
                              .add(const Duration(days: 365)),
                          initialDate: endDate ?? DateTime.now(),
                        );
                        if (picked != null) {
                          setDialogState(() => endDate = picked);
                        }
                      },
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  child: const Text('Скасувати'),
                ),
                ElevatedButton(
                  onPressed: () {
                    if (clientController.text.trim().isEmpty) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                            content: Text('Введіть назву клієнта')),
                      );
                      return;
                    }
                    Navigator.of(context).pop(true);
                  },
                  child: const Text('Зарезервувати'),
                ),
              ],
            );
          },
        );
      },
    );

    if (result != true) return;

    try {
      await EquipmentService.instance.reserveEquipment(
        equipmentId: item.id,
        clientName: clientController.text.trim(),
        notes: notesController.text.trim().isEmpty
            ? null
            : notesController.text.trim(),
        endDate: endDate?.toIso8601String().split('T').first,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Обладнання зарезервовано')),
      );
      _loadData();
      if (_tabController.index == 1) _loadReservationHistory();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AuthService.parseError(error))),
      );
    }
  }

  /// Подати заявку на тестування обладнання (як кнопка «На тест» у веб-версії).
  Future<void> _requestTesting(Equipment item) async {
    final status = item.testingStatus ?? 'none';
    if (status == 'requested' || status == 'in_progress') return;
    try {
      await EquipmentService.instance.requestTesting(item.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Заявку на тестування подано')),
      );
      _loadData();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AuthService.parseError(error))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Менеджери'),
        bottom: TabBar(
          controller: _tabController,
          onTap: (_) {
            if (_tabController.index == 1 && _reservationHistory.isEmpty) {
              _loadReservationHistory();
            }
          },
          tabs: const [
            Tab(text: 'Залишки на складах'),
            Tab(text: 'Історія резервування'),
          ],
        ),
        actions: [
          IconButton(
            onPressed: _loadData,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildStockTab(),
          _buildHistoryTab(),
        ],
      ),
    );
  }

  Widget _buildStockTab() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(child: Text(_error!));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: DropdownButtonFormField<String>(
            value: _selectedWarehouseId ?? '',
            decoration: const InputDecoration(
              labelText: 'Склад',
              border: OutlineInputBorder(),
            ),
            items: [
              const DropdownMenuItem(
                value: '',
                child: Text('Всі склади'),
              ),
              ..._warehouses.map(
                (w) => DropdownMenuItem(
                  value: w.id,
                  child: Text(w.name),
                ),
              ),
            ],
            onChanged: (value) {
              setState(() {
                _selectedWarehouseId = value?.isEmpty ?? true ? null : value;
              });
            },
          ),
        ),
        Expanded(
          child: _filteredEquipment.isEmpty
              ? const Center(child: Text('Немає обладнання'))
              : ListView.separated(
                  itemCount: _filteredEquipment.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (context, index) {
                    final item = _filteredEquipment[index];
                    final reservationLabel = _reservationLabel(item);
                    final isReserved = reservationLabel == 'Зарезервовано';
                    final canReserve = item.status == 'in_stock';
                    final testingStatusNorm = _normalizeTestingStatus(item.testingStatus);
                    return InkWell(
                      onTap: () => _openDetail(item),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 12,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              item.type ?? 'Обладнання',
                              style: Theme.of(context).textTheme.titleSmall,
                            ),
                            const SizedBox(height: 4),
                            Text(
                              [
                                item.serialNumber ?? '—',
                                item.currentWarehouseName ?? '—',
                                _statusLabel(item.status),
                              ].join(' · '),
                              style: Theme.of(context).textTheme.bodyMedium,
                            ),
                            const SizedBox(height: 6),
                            Row(
                              children: [
                                Icon(
                                  isReserved ? Icons.lock : Icons.lock_open,
                                  size: 14,
                                  color: isReserved
                                      ? Theme.of(context).colorScheme.primary
                                      : Colors.grey,
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  reservationLabel,
                                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                        color: isReserved
                                            ? Theme.of(context).colorScheme.primary
                                            : Colors.grey,
                                        fontWeight:
                                            isReserved ? FontWeight.w600 : null,
                                      ),
                                ),
                                const SizedBox(width: 12),
                                _buildTestingStatusIcon(context, testingStatusNorm),
                                const SizedBox(width: 4),
                                Flexible(
                                  child: Text(
                                    _testingStatusLabel(item),
                                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                          color: _testingStatusColor(testingStatusNorm),
                                          fontWeight: FontWeight.w500,
                                        ),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: [
                                if (canReserve)
                                  FilledButton.tonalIcon(
                                    onPressed: () => _showReserveDialog(item),
                                    icon: const Icon(Icons.lock, size: 18),
                                    label: const Text('Резервувати'),
                                  ),
                                FilledButton.tonalIcon(
                                  onPressed: _canRequestTesting(item)
                                      ? () => _requestTesting(item)
                                      : null,
                                  icon: const Icon(Icons.science_outlined, size: 18),
                                  label: const Text('На тест'),
                                ),
                              ],
                            ),
                            if (isReserved && !canReserve) ...[
                              const SizedBox(height: 4),
                              Text(
                                'Зарезервовано',
                                style: TextStyle(
                                  color: Theme.of(context).colorScheme.primary,
                                  fontWeight: FontWeight.w600,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }

  Widget _buildHistoryTab() {
    if (_historyLoading && _reservationHistory.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null && _reservationHistory.isEmpty) {
      return Center(child: Text(_error!));
    }
    if (_reservationHistory.isEmpty) {
      return const Center(child: Text('Історія резервувань порожня'));
    }

    return RefreshIndicator(
      onRefresh: _loadReservationHistory,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: _reservationHistory.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (context, index) {
          final record = _reservationHistory[index];
          final action = record['action']?.toString() ?? '';
          final date = record['date']?.toString();
          final equipmentType = record['equipmentType']?.toString() ?? '—';
          final equipmentSerial = record['equipmentSerial']?.toString() ?? '—';
          final clientName = record['clientName']?.toString() ?? '—';
          final userName = record['userName']?.toString() ?? '—';
          final isReserved = action == 'reserved';

          return ListTile(
            title: Text(
              isReserved ? 'Резервування' : 'Зняття резерву',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('$equipmentType · $equipmentSerial'),
                Text('Клієнт: $clientName'),
                if (userName.isNotEmpty) Text('Виконавець: $userName'),
                if (date != null && date.isNotEmpty)
                  Text(
                    _formatDate(date) ?? date,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                if (isReserved &&
                    record['endDate'] != null &&
                    record['endDate'].toString().isNotEmpty)
                  Text(
                    'До: ${_formatDate(record['endDate'].toString()) ?? record['endDate'].toString().split('T').first}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                if (!isReserved &&
                    record['cancelReason']?.toString().isNotEmpty == true)
                  Text(
                    'Причина: ${record['cancelReason']}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
              ],
            ),
            leading: Icon(
              isReserved ? Icons.lock : Icons.lock_open,
              color: isReserved ? Colors.green : Colors.orange,
            ),
          );
        },
      ),
    );
  }
}
