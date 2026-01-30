import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/models/equipment.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/equipment_service.dart';
import '../../core/services/file_service.dart';

class TestingDetailsScreen extends StatefulWidget {
  const TestingDetailsScreen({super.key, required this.equipment});

  final Equipment equipment;

  @override
  State<TestingDetailsScreen> createState() => _TestingDetailsScreenState();
}

class _TestingDetailsScreenState extends State<TestingDetailsScreen> {
  final _formKey = GlobalKey<FormState>();
  bool _saving = false;
  bool _uploading = false;
  String? _error;
  bool _editing = false;

  final _resultController = TextEditingController();
  final _notesController = TextEditingController();
  final _materialsController = TextEditingController();
  final _procedureController = TextEditingController();
  final _conclusionController = TextEditingController();
  final _engineer1Controller = TextEditingController();
  final _engineer2Controller = TextEditingController();
  final _engineer3Controller = TextEditingController();

  @override
  void dispose() {
    _resultController.dispose();
    _notesController.dispose();
    _materialsController.dispose();
    _procedureController.dispose();
    _conclusionController.dispose();
    _engineer1Controller.dispose();
    _engineer2Controller.dispose();
    _engineer3Controller.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    final equipment = widget.equipment;
    _resultController.text = equipment.testingResult ?? '';
    _notesController.text = equipment.testingNotes ?? '';
    _materialsController.text = equipment.testingMaterials ?? '';
    _procedureController.text = equipment.testingProcedure ?? '';
    _conclusionController.text = equipment.testingConclusion ?? '';
    _engineer1Controller.text = equipment.engineer1 ?? '';
    _engineer2Controller.text = equipment.engineer2 ?? '';
    _engineer3Controller.text = equipment.engineer3 ?? '';
    if (equipment.testingStatus == 'completed' ||
        equipment.testingStatus == 'failed') {
      _editing = true;
    }
  }

  Future<void> _saveEdit() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await EquipmentService.instance.updateTesting(
        equipmentId: widget.equipment.id,
        result: _resultController.text.trim(),
        notes: _notesController.text.trim(),
        materials: _materialsController.text.trim(),
        procedure: _procedureController.text.trim(),
        conclusion: _conclusionController.text.trim(),
        engineer1: _engineer1Controller.text.trim(),
        engineer2: _engineer2Controller.text.trim(),
        engineer3: _engineer3Controller.text.trim(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Зміни збережено')),
      );
      Navigator.of(context).pop(true);
    } catch (error) {
      setState(() {
        _error = AuthService.parseError(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await EquipmentService.instance.completeTesting(
        equipmentId: widget.equipment.id,
        result: _resultController.text.trim(),
        notes: _notesController.text.trim(),
        materials: _materialsController.text.trim(),
        procedure: _procedureController.text.trim(),
        conclusion: _conclusionController.text.trim(),
        engineer1: _engineer1Controller.text.trim(),
        engineer2: _engineer2Controller.text.trim(),
        engineer3: _engineer3Controller.text.trim(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Тестування завершено')),
      );
      Navigator.of(context).pop(true);
    } catch (error) {
      setState(() {
        _error = AuthService.parseError(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  Future<void> _uploadPhoto(ImageSource source) async {
    setState(() {
      _uploading = true;
      _error = null;
    });
    try {
      final picker = ImagePicker();
      final file = await picker.pickImage(source: source, imageQuality: 85);
      if (file == null) {
        setState(() {
          _uploading = false;
        });
        return;
      }
      await FileService.instance.uploadTestingFiles(
        equipmentId: widget.equipment.id,
        files: [file],
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Фото завантажено')),
      );
    } catch (error) {
      setState(() {
        _error = AuthService.parseError(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _uploading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final equipment = widget.equipment;
    final isCompleted = equipment.testingStatus == 'completed' ||
        equipment.testingStatus == 'failed';
    return Scaffold(
      appBar: AppBar(
        title: Text(isCompleted ? 'Редагування тесту' : 'Завершення тесту'),
      ),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                equipment.type ?? 'Обладнання',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 4),
              Text(equipment.serialNumber ?? 'Серійний номер не вказано'),
              const SizedBox(height: 16),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(
                    _error!,
                    style: TextStyle(color: Colors.red.shade700),
                  ),
                ),
              TextFormField(
                controller: _resultController,
                decoration: const InputDecoration(
                  labelText: 'Результат',
                  border: OutlineInputBorder(),
                ),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return 'Вкажіть результат';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _notesController,
                decoration: const InputDecoration(
                  labelText: 'Примітки',
                  border: OutlineInputBorder(),
                ),
                maxLines: 2,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _materialsController,
                decoration: const InputDecoration(
                  labelText: 'Матеріали',
                  border: OutlineInputBorder(),
                ),
                maxLines: 2,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _procedureController,
                decoration: const InputDecoration(
                  labelText: 'Процедура',
                  border: OutlineInputBorder(),
                ),
                maxLines: 2,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _conclusionController,
                decoration: const InputDecoration(
                  labelText: 'Висновок',
                  border: OutlineInputBorder(),
                ),
                maxLines: 2,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _engineer1Controller,
                decoration: const InputDecoration(
                  labelText: 'Інженер 1',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _engineer2Controller,
                decoration: const InputDecoration(
                  labelText: 'Інженер 2',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _engineer3Controller,
                decoration: const InputDecoration(
                  labelText: 'Інженер 3',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                'Фото тестування',
                style: Theme.of(context).textTheme.titleSmall,
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed:
                          _uploading ? null : () => _uploadPhoto(ImageSource.camera),
                      icon: const Icon(Icons.photo_camera),
                      label: const Text('Камера'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed:
                          _uploading ? null : () => _uploadPhoto(ImageSource.gallery),
                      icon: const Icon(Icons.photo_library),
                      label: const Text('Галерея'),
                    ),
                  ),
                ],
              ),
              if (_uploading)
                const Padding(
                  padding: EdgeInsets.only(top: 12),
                  child: LinearProgressIndicator(),
                ),
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: _saving
                    ? null
                    : (isCompleted ? _saveEdit : _submit),
                child: _saving
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(isCompleted ? 'Зберегти зміни' : 'Завершити тест'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
