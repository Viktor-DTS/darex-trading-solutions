import 'package:flutter/material.dart';

import '../../core/models/movement_document.dart';
import '../../core/models/receipt_document.dart';
import '../../core/models/shipment_document.dart';

class DocumentDetailsScreen extends StatelessWidget {
  const DocumentDetailsScreen.movement({
    super.key,
    required this.document,
  })  : shipmentDocument = null,
        receiptDocument = null,
        isMovement = true;

  const DocumentDetailsScreen.shipment({
    super.key,
    required this.shipmentDocument,
  })  : document = null,
        receiptDocument = null,
        isMovement = false;

  const DocumentDetailsScreen.receipt({
    super.key,
    required this.receiptDocument,
  })  : document = null,
        shipmentDocument = null,
        isMovement = false;

  final MovementDocument? document;
  final ShipmentDocument? shipmentDocument;
  final ReceiptDocument? receiptDocument;
  final bool isMovement;

  @override
  Widget build(BuildContext context) {
    if (isMovement && document != null) {
      return _buildMovement(context, document!);
    }
    if (!isMovement && shipmentDocument != null) {
      return _buildShipment(context, shipmentDocument!);
    }
    if (receiptDocument != null) {
      return _buildReceipt(context, receiptDocument!);
    }
    return const Scaffold(
      body: Center(child: Text('Документ недоступний')),
    );
  }

  Widget _buildReceipt(BuildContext context, ReceiptDocument doc) {
    String statusLabel(String? s) {
      if (s == null) return '—';
      switch (s) {
        case 'draft': return 'Чернетка';
        case 'completed': return 'Завершено';
        case 'cancelled': return 'Скасовано';
        default: return s;
      }
    }
    return Scaffold(
      appBar: AppBar(title: Text(doc.documentNumber)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(doc.warehouseName ?? doc.warehouse ?? '—', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            if (doc.supplier != null && doc.supplier!.isNotEmpty)
              Text('Постачальник: ${doc.supplier}', style: Theme.of(context).textTheme.bodyMedium),
            Text('Дата: ${doc.documentDate}'),
            Text('Статус: ${statusLabel(doc.status)}'),
            if (doc.totalAmount != null) Text('Сума: ${doc.totalAmount} ${doc.currency ?? 'грн.'}'),
            const SizedBox(height: 16),
            Text('Позиції (${doc.items.length})', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            ...doc.items.map(
              (item) => ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(item.type ?? item.batchName ?? 'Обладнання'),
                subtitle: Text(item.serialNumber ?? item.batchName ?? '—'),
                trailing: Text('×${item.quantity}'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMovement(BuildContext context, MovementDocument doc) {
    return Scaffold(
      appBar: AppBar(
        title: Text(doc.documentNumber),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              '${doc.fromWarehouseName ?? '—'} → ${doc.toWarehouseName ?? '—'}',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text('Дата: ${doc.documentDate}'),
            const SizedBox(height: 16),
            Text(
              'Позиції (${doc.items.length})',
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(height: 8),
            ...doc.items.map(
              (item) => ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(item.type ?? 'Обладнання'),
                subtitle: Text(item.serialNumber ?? 'Без серійного номера'),
                trailing: Text(item.quantity?.toString() ?? '1'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildShipment(BuildContext context, ShipmentDocument doc) {
    return Scaffold(
      appBar: AppBar(
        title: Text(doc.documentNumber),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              doc.shippedTo ?? 'Отримувач не вказаний',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text('Дата: ${doc.documentDate}'),
            const SizedBox(height: 16),
            Text(
              'Позиції (${doc.items.length})',
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(height: 8),
            ...doc.items.map(
              (item) => ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(item.type ?? 'Обладнання'),
                subtitle: Text(item.serialNumber ?? 'Без серійного номера'),
                trailing: Text(item.quantity?.toString() ?? '1'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
