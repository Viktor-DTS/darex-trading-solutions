import 'package:flutter/material.dart';

import 'package:url_launcher/url_launcher.dart';

import '../../core/models/task.dart';
import '../../core/services/file_service.dart';

class ManagerTaskDetailsScreen extends StatelessWidget {
  const ManagerTaskDetailsScreen({super.key, required this.task});

  final Task task;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Деталі заявки'),
      ),
      body: SafeArea(
        child: FutureBuilder<List<Map<String, dynamic>>>(
          future: FileService.instance.fetchTaskFiles(task.id),
          builder: (context, snapshot) {
            final files = snapshot.data ?? [];
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text(
                  task.requestNumber ?? 'Без номера',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                _InfoRow(label: 'Статус', value: task.status),
                _InfoRow(label: 'Клієнт', value: task.client ?? '—'),
                _InfoRow(label: 'Опис', value: task.requestDesc ?? '—'),
                _InfoRow(label: 'Дата заявки', value: task.requestDate ?? '—'),
                _InfoRow(label: 'Регіон', value: task.serviceRegion ?? '—'),
                const SizedBox(height: 16),
                if (snapshot.connectionState == ConnectionState.waiting)
                  const Center(child: CircularProgressIndicator()),
                if (files.isNotEmpty) ...[
                  Text(
                    'Файли (${files.length})',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: 8),
                  ...files.map(
                    (file) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.attach_file),
                      title: Text(
                        file['originalName']?.toString() ?? 'Файл',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      subtitle: Text(
                        file['uploadDate']?.toString() ?? '',
                      ),
                      onTap: () {
                        final url = file['cloudinaryUrl']?.toString();
                        if (url == null || url.isEmpty) {
                          return;
                        }
                        final uri = Uri.parse(url);
                        launchUrl(uri, mode: LaunchMode.externalApplication);
                      },
                    ),
                  ),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(fontWeight: FontWeight.w600),
            ),
          ),
          Expanded(
            child: Text(value),
          ),
        ],
      ),
    );
  }
}
