import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/models/client_data.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/client_service.dart';
import '../../core/services/draft_service.dart';
import '../../core/services/region_service.dart';
import '../../core/services/task_service.dart';

class OperatorCreateTaskScreen extends StatefulWidget {
  const OperatorCreateTaskScreen({super.key});

  static const routeName = '/operator';

  @override
  State<OperatorCreateTaskScreen> createState() =>
      _OperatorCreateTaskScreenState();
}

class _OperatorCreateTaskScreenState extends State<OperatorCreateTaskScreen> {
  int _currentStep = 0;
  bool _isSaving = false;
  String? _error;
  bool _loadingClient = false;
  bool _loadingEdrpou = false;
  List<String> _edrpouList = [];
  List<String> _regions = [];
  Timer? _draftTimer;

  final _clientController = TextEditingController();
  final _edrpouController = TextEditingController();
  final _addressController = TextEditingController();
  final _descController = TextEditingController();
  final _regionController = TextEditingController();
  final _plannedDateController = TextEditingController();
  final _contactPersonController = TextEditingController();
  final _contactPhoneController = TextEditingController();
  final _invoiceRecipientController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _regionController.text = AuthService.instance.region ?? '';
    _loadEdrpouList();
    _loadRegions();
    _initDraft();
    _attachDraftListeners();
  }

  @override
  void dispose() {
    _draftTimer?.cancel();
    _clientController.dispose();
    _edrpouController.dispose();
    _addressController.dispose();
    _descController.dispose();
    _regionController.dispose();
    _plannedDateController.dispose();
    _contactPersonController.dispose();
    _contactPhoneController.dispose();
    _invoiceRecipientController.dispose();
    super.dispose();
  }

  Future<void> _loadClientData() async {
    final edrpou = _edrpouController.text.trim();
    if (edrpou.isEmpty) {
      setState(() => _error = 'Вкажіть ЄДРПОУ для пошуку');
      return;
    }
    setState(() {
      _loadingClient = true;
      _error = null;
    });
    try {
      final ClientData data =
          await ClientService.instance.fetchClientData(edrpou);
      _clientController.text = data.client;
      _addressController.text = data.address;
      _invoiceRecipientController.text = data.invoiceRecipientDetails;
    } catch (error) {
      setState(() {
        _error = AuthService.parseError(error);
      });
    } finally {
      setState(() {
        _loadingClient = false;
      });
    }
  }

  Future<void> _loadEdrpouList() async {
    setState(() => _loadingEdrpou = true);
    try {
      final list = await ClientService.instance.fetchEdrpouList();
      setState(() {
        _edrpouList = list;
      });
    } catch (_) {
      // ignore
    } finally {
      setState(() => _loadingEdrpou = false);
    }
  }

  Future<void> _loadRegions() async {
    try {
      final regions = await RegionService.instance.fetchRegions();
      setState(() {
        _regions = regions;
      });
    } catch (_) {
      // ignore
    }
  }

  void _attachDraftListeners() {
    final controllers = [
      _clientController,
      _edrpouController,
      _addressController,
      _descController,
      _regionController,
      _plannedDateController,
      _contactPersonController,
      _contactPhoneController,
      _invoiceRecipientController,
    ];
    for (final controller in controllers) {
      controller.addListener(_scheduleDraftSave);
    }
  }

  void _scheduleDraftSave() {
    _draftTimer?.cancel();
    _draftTimer = Timer(const Duration(milliseconds: 600), _saveDraft);
  }

  Future<void> _saveDraft() async {
    final draft = {
      'step': _currentStep,
      'client': _clientController.text,
      'edrpou': _edrpouController.text,
      'address': _addressController.text,
      'requestDesc': _descController.text,
      'region': _regionController.text,
      'plannedDate': _plannedDateController.text,
      'contactPerson': _contactPersonController.text,
      'contactPhone': _contactPhoneController.text,
      'invoiceRecipientDetails': _invoiceRecipientController.text,
    };
    await DraftService.instance.saveOperatorDraft(draft);
  }

  Future<void> _initDraft() async {
    final draft = await DraftService.instance.loadOperatorDraft();
    if (draft == null || draft.isEmpty) {
      return;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final restore = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Відновити чернетку?'),
          content:
              const Text('Є незбережена заявка. Відновити дані з чернетки?'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Ні'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Так'),
            ),
          ],
        ),
      );
      if (restore == true) {
        _applyDraft(draft);
      }
    });
  }

  void _applyDraft(Map<String, dynamic> draft) {
    setState(() {
      _currentStep = (draft['step'] as int?) ?? 0;
      _clientController.text = draft['client']?.toString() ?? '';
      _edrpouController.text = draft['edrpou']?.toString() ?? '';
      _addressController.text = draft['address']?.toString() ?? '';
      _descController.text = draft['requestDesc']?.toString() ?? '';
      _regionController.text = draft['region']?.toString() ?? '';
      _plannedDateController.text = draft['plannedDate']?.toString() ?? '';
      _contactPersonController.text = draft['contactPerson']?.toString() ?? '';
      _contactPhoneController.text = draft['contactPhone']?.toString() ?? '';
      _invoiceRecipientController.text =
          draft['invoiceRecipientDetails']?.toString() ?? '';
    });
  }

  /// Діалог відкривається одразу; список завантажується всередині, щоб не зависати.
  Future<void> _showEdrpouPicker() async {
    final result = await showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (context) => _EdrpouPickerDialog(initialList: _edrpouList),
    );

    if (result != null && result.isNotEmpty) {
      setState(() {
        _edrpouController.text = result;
      });
    }
    // Оновлюємо кеш для наступного відкриття
    if (result != null && !_edrpouList.contains(result)) {
      _edrpouList = [..._edrpouList, result];
    }
  }

  Future<void> _submit() async {
    setState(() {
      _isSaving = true;
      _error = null;
    });

    try {
      final region = _regionController.text.trim();
      final client = _clientController.text.trim();
      final edrpou = _edrpouController.text.trim();
      final address = _addressController.text.trim();
      final desc = _descController.text.trim();
      final plannedDate = _plannedDateController.text.trim();
      final contactPhone = _contactPhoneController.text.trim();

      if (client.isEmpty) {
        throw 'Вкажіть назву клієнта';
      }
      if (edrpou.isEmpty) {
        throw 'Вкажіть ЄДРПОУ';
      }
      if (address.isEmpty) {
        throw 'Вкажіть адресу';
      }
      if (desc.isEmpty) {
        throw 'Вкажіть опис заявки';
      }
      if (region.isEmpty) {
        throw 'Вкажіть регіон сервісного відділу';
      }
      if (plannedDate.isEmpty) {
        throw 'Вкажіть планову дату';
      }
      if (contactPhone.isEmpty) {
        throw 'Вкажіть телефон контактної особи';
      }

      await TaskService.instance.createTask({
        'status': 'Заявка',
        'requestDate': DateTime.now().toIso8601String().split('T').first,
        'serviceRegion': region,
        'client': client,
        'edrpou': edrpou,
        'address': address,
        'invoiceRecipientDetails': _invoiceRecipientController.text.trim(),
        'requestDesc': desc,
        'plannedDate': plannedDate,
        'contactPerson': _contactPersonController.text.trim(),
        'contactPhone': contactPhone,
      });

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Заявку створено')),
      );
      await DraftService.instance.clearOperatorDraft();
      Navigator.of(context).pop();
    } catch (error) {
      setState(() {
        _error = AuthService.parseError(error);
      });
    } finally {
      setState(() {
        _isSaving = false;
      });
    }
  }

  List<Step> get _steps => [
        Step(
          title: const Text('Клієнт'),
          content: Column(
            children: [
              TextField(
                controller: _clientController,
                decoration: const InputDecoration(
                  labelText: 'Назва клієнта',
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
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _loadingEdrpou ? null : _showEdrpouPicker,
                      icon: _loadingEdrpou
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.list),
                      label: const Text('Список ЄДРПОУ'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerRight,
                child: ElevatedButton.icon(
                  onPressed: _loadingClient ? null : _loadClientData,
                  icon: _loadingClient
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.search),
                  label: const Text('Підтягнути дані'),
                ),
              ),
            ],
          ),
          isActive: _currentStep >= 0,
        ),
        Step(
          title: const Text('Адреса'),
          content: TextField(
            controller: _addressController,
            decoration: const InputDecoration(
              labelText: 'Адреса',
              border: OutlineInputBorder(),
            ),
          ),
          isActive: _currentStep >= 1,
        ),
        Step(
          title: const Text('Реквізити'),
          content: TextField(
            controller: _invoiceRecipientController,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'Реквізити отримувача рахунку',
              border: OutlineInputBorder(),
            ),
          ),
          isActive: _currentStep >= 2,
        ),
        Step(
          title: const Text('Опис'),
          content: TextField(
            controller: _descController,
            maxLines: 4,
            decoration: const InputDecoration(
              labelText: 'Опис заявки',
              border: OutlineInputBorder(),
            ),
          ),
          isActive: _currentStep >= 3,
        ),
        Step(
          title: const Text('Планування'),
          content: Column(
            children: [
              DropdownButtonFormField<String>(
                value: _regions.contains(_regionController.text)
                    ? _regionController.text
                    : null,
                items: _regions
                    .map(
                      (region) => DropdownMenuItem(
                        value: region,
                        child: Text(region),
                      ),
                    )
                    .toList(),
                onChanged: (value) {
                  if (value == null) return;
                  _regionController.text = value;
                },
                decoration: const InputDecoration(
                  labelText: 'Регіон сервісного відділу',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _plannedDateController,
                readOnly: true,
                decoration: const InputDecoration(
                  labelText: 'Планова дата (YYYY-MM-DD)',
                  border: OutlineInputBorder(),
                ),
                onTap: () async {
                  final now = DateTime.now();
                  final picked = await showDatePicker(
                    context: context,
                    firstDate: now,
                    lastDate: now.add(const Duration(days: 365)),
                    initialDate: now,
                  );
                  if (picked != null) {
                    _plannedDateController.text =
                        picked.toIso8601String().split('T').first;
                  }
                },
              ),
            ],
          ),
          isActive: _currentStep >= 4,
        ),
        Step(
          title: const Text('Контакт'),
          content: Column(
            children: [
              TextField(
                controller: _contactPersonController,
                decoration: const InputDecoration(
                  labelText: 'Контактна особа',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _contactPhoneController,
                keyboardType: TextInputType.phone,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(13),
                ],
                decoration: const InputDecoration(
                  labelText: 'Телефон контактної особи',
                  border: OutlineInputBorder(),
                ),
              ),
            ],
          ),
          isActive: _currentStep >= 5,
        ),
      ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Нова заявка'),
      ),
      body: SafeArea(
        child: Column(
          children: [
            if (_error != null)
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  _error!,
                  style: TextStyle(color: Colors.red.shade700),
                ),
              ),
            Expanded(
              child: Stepper(
                currentStep: _currentStep,
                onStepContinue: () {
                  if (_currentStep < _steps.length - 1) {
                    setState(() => _currentStep += 1);
                    _scheduleDraftSave();
                  } else {
                    _submit();
                  }
                },
                onStepCancel: () {
                  if (_currentStep > 0) {
                    setState(() => _currentStep -= 1);
                    _scheduleDraftSave();
                  }
                },
                steps: _steps,
                controlsBuilder: (context, details) {
                  final isLast = _currentStep == _steps.length - 1;
                  return Row(
                    children: [
                      ElevatedButton(
                        onPressed: _isSaving ? null : details.onStepContinue,
                        child: _isSaving
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : Text(isLast ? 'Створити' : 'Далі'),
                      ),
                      const SizedBox(width: 12),
                      if (_currentStep > 0)
                        TextButton(
                          onPressed: _isSaving ? null : details.onStepCancel,
                          child: const Text('Назад'),
                        ),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Діалог вибору ЄДРПОУ: відкривається одразу, список підвантажується всередині.
class _EdrpouPickerDialog extends StatefulWidget {
  const _EdrpouPickerDialog({required this.initialList});

  final List<String> initialList;

  @override
  State<_EdrpouPickerDialog> createState() => _EdrpouPickerDialogState();
}

class _EdrpouPickerDialogState extends State<_EdrpouPickerDialog> {
  bool _loading = true;
  String? _error;
  List<String> _list = [];
  String _query = '';

  @override
  void initState() {
    super.initState();
    if (widget.initialList.isNotEmpty) {
      _list = List.from(widget.initialList);
      _loading = false;
    } else {
      _load();
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await ClientService.instance.fetchEdrpouList();
      if (!mounted) return;
      setState(() {
        _list = list;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _list
        .where((item) => item.toLowerCase().contains(_query.toLowerCase()))
        .take(100)
        .toList();

    return AlertDialog(
      title: const Text('Виберіть ЄДРПОУ'),
      content: SizedBox(
        width: double.maxFinite,
        child: _loading
            ? const Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Center(child: CircularProgressIndicator()),
              )
            : _error != null
                ? Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          _error!,
                          style: TextStyle(color: Colors.red.shade700),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 16),
                        TextButton.icon(
                          onPressed: _load,
                          icon: const Icon(Icons.refresh),
                          label: const Text('Повторити'),
                        ),
                      ],
                    ),
                  )
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      TextField(
                        decoration: const InputDecoration(
                          labelText: 'Пошук',
                          border: OutlineInputBorder(),
                        ),
                        onChanged: (value) => setState(() => _query = value.trim()),
                      ),
                      const SizedBox(height: 12),
                      SizedBox(
                        height: 260,
                        child: ListView.builder(
                          itemCount: filtered.length,
                          itemBuilder: (context, index) {
                            final item = filtered[index];
                            return ListTile(
                              title: Text(item),
                              onTap: () {
                                Navigator.of(context).pop(item);
                              },
                            );
                          },
                        ),
                      ),
                    ],
                  ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Закрити'),
        ),
      ],
    );
  }
}
