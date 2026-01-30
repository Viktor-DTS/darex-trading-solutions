import 'package:flutter/material.dart';

import '../../core/models/equipment.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/api_client.dart';
import 'testing_details_screen.dart';

class TestingRequestsScreen extends StatefulWidget {
  const TestingRequestsScreen({super.key});

  static const routeName = '/testing';

  @override
  State<TestingRequestsScreen> createState() => _TestingRequestsScreenState();
}

class _TestingRequestsScreenState extends State<TestingRequestsScreen> {
  bool _loading = false;
  String? _error;
  List<Equipment> _requests = [];

  @override
  void initState() {
    super.initState();
    _loadRequests();
  }

  Future<void> _loadRequests() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await ApiClient.instance.dio.get(
        '/api/equipment/testing-requests',
        queryParameters: {'status': 'requested,in_progress'},
      );
      final data = response.data;
      if (data is List) {
        _requests = data
            .whereType<Map<String, dynamic>>()
            .map(Equipment.fromJson)
            .toList();
      }
    } catch (error) {
      _error = AuthService.parseError(error);
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
        title: const Text('Відділ тестування'),
        actions: [
          IconButton(
            onPressed: _loadRequests,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(child: Text(_error!))
                : _requests.isEmpty
                    ? const Center(child: Text('Немає заявок на тестування'))
                    : ListView.separated(
                        itemCount: _requests.length,
                        separatorBuilder: (_, __) =>
                            const Divider(height: 1),
                        itemBuilder: (context, index) {
                          final item = _requests[index];
                          return ListTile(
                            title: Text(item.type ?? 'Обладнання'),
                            subtitle: Text(
                              item.serialNumber ?? 'Серійний номер не вказано',
                            ),
                            trailing: const Icon(Icons.chevron_right),
                            onTap: () {
                              Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) => TestingDetailsScreen(
                                    equipment: item,
                                  ),
                                ),
                              );
                            },
                          );
                        },
                      ),
      ),
    );
  }
}
