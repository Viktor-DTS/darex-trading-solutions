import 'package:flutter/material.dart';

import '../../core/services/auth_service.dart';
import '../../core/services/event_log_service.dart';

class ManagerTaskTimelineScreen extends StatefulWidget {
  const ManagerTaskTimelineScreen({super.key, required this.taskId});

  final String taskId;

  @override
  State<ManagerTaskTimelineScreen> createState() =>
      _ManagerTaskTimelineScreenState();
}

class _ManagerTaskTimelineScreenState extends State<ManagerTaskTimelineScreen> {
  bool _loading = false;
  String? _error;
  List<Map<String, dynamic>> _events = [];

  @override
  void initState() {
    super.initState();
    _loadEvents();
  }

  Future<void> _loadEvents() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final events = await EventLogService.instance.fetchEvents(
        entityType: 'equipment',
      );
      setState(() {
        _events = events
            .where((event) =>
                event['entityId']?.toString() == widget.taskId ||
                event['details']?['taskId']?.toString() == widget.taskId)
            .toList();
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Історія змін'),
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(child: Text(_error!))
                : _events.isEmpty
                    ? const Center(child: Text('Немає історії змін'))
                    : ListView.separated(
                        itemCount: _events.length,
                        separatorBuilder: (_, __) =>
                            const Divider(height: 1),
                        itemBuilder: (context, index) {
                          final event = _events[index];
                          return ListTile(
                            title: Text(event['description']?.toString() ?? ''),
                            subtitle: Text(
                              event['timestamp']?.toString() ?? '',
                            ),
                          );
                        },
                      ),
      ),
    );
  }
}
