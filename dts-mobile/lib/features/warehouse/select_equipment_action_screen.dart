import 'package:flutter/material.dart';

import '../../core/models/equipment.dart';
import '../../core/services/equipment_service.dart';

/// Екран вибору обладнання для операції переміщення або відвантаження.
class SelectEquipmentActionScreen extends StatefulWidget {
  const SelectEquipmentActionScreen({
    super.key,
    required this.action,
  });

  static const routeName = '/warehouse/select-equipment-action';

  /// 'move' або 'ship'
  final String action;

  @override
  State<SelectEquipmentActionScreen> createState() => _SelectEquipmentActionScreenState();
}

class _SelectEquipmentActionScreenState extends State<SelectEquipmentActionScreen> {
  List<Equipment> _list = [];
  bool _loading = true;
  String? _error;

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
      final all = await EquipmentService.instance.fetchEquipment();
      final available = all.where((e) {
        final s = e.status ?? '';
        return s != 'shipped' && s != 'written_off' && s != 'deleted' &&
            (s == 'in_stock' || s == 'reserved' || s.isEmpty);
      }).toList();
      if (!mounted) return;
      setState(() {
        _list = available;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final title = widget.action == 'move' ? 'Оберіть обладнання для переміщення' : 'Оберіть обладнання для відвантаження';

    if (_loading) {
      return Scaffold(
        appBar: AppBar(title: Text(title)),
        body: const Center(child: CircularProgressIndicator()),
      );
    }
    if (_error != null) {
      return Scaffold(
        appBar: AppBar(title: Text(title)),
        body: Center(child: Text(_error!)),
      );
    }
    if (_list.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: Text(title)),
        body: const Center(child: Text('Немає доступного обладнання')),
      );
    }

    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: ListView.separated(
        itemCount: _list.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (context, index) {
          final item = _list[index];
          return ListTile(
            title: Text(item.type ?? 'Обладнання'),
            subtitle: Text(
              [
                item.serialNumber ?? 'Без серійного номера',
                item.currentWarehouseName ?? '',
              ].where((s) => s.isNotEmpty).join(' · '),
            ),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).pop(item),
          );
        },
      ),
    );
  }
}
