import 'package:flutter/material.dart';

import '../../core/models/movement_document.dart';
import '../../core/models/shipment_document.dart';

class DocumentDetailsScreen extends StatelessWidget {
  const DocumentDetailsScreen.movement({
    super.key,
    required this.document,
  })  : shipmentDocument = null,
        isMovement = true;

  const DocumentDetailsScreen.shipment({
    super.key,
    required this.shipmentDocument,
  })  : document = null,
        isMovement = false;

  final MovementDocument? document;
  final ShipmentDocument? shipmentDocument;
  final bool isMovement;

  @override
  Widget build(BuildContext context) {
    if (isMovement && document != null) {
      return _buildMovement(context, document!);
    }
    if (!isMovement && shipmentDocument != null) {
      return _buildShipment(context, shipmentDocument!);
    }
    return const Scaffold(
      body: Center(child: Text('Документ недоступний')),
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
