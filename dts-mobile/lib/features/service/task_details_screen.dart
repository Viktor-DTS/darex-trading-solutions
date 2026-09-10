import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/models/task.dart';
import '../../core/services/assigned_inbox_service.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/connectivity_service.dart';
import '../../core/services/file_service.dart';
import '../../core/services/offline_sync_service.dart';
import '../../core/services/task_service.dart';
import 'package:url_launcher/url_launcher.dart';
import 'photo_capture_session_screen.dart';

/// Поля заявки для відображення (як у веб-версії). Тільки перегляд; редагування заборонено.
/// Єдине дозволене — додавання фото/файлів через камеру та галерею.
class TaskDetailsScreen extends StatefulWidget {
  const TaskDetailsScreen({super.key, required this.task});

  final Task task;

  @override
  State<TaskDetailsScreen> createState() => _TaskDetailsScreenState();
}

class _TaskDetailsScreenState extends State<TaskDetailsScreen> {
  Map<String, dynamic>? _fullTask;
  bool _loadingDetails = true;
  bool _uploading = false;
  bool _completing = false;
  String? _error;
  List<Map<String, dynamic>> _files = [];
  List<Map<String, dynamic>> _pendingPhotos = [];
  bool _pendingComplete = false;

  List<Map<String, dynamic>> get _displayFiles => [..._files, ..._pendingPhotos];

  /// Порядок і підписи полів (як у веб-версії). Порожні не показуємо.
  static const Map<String, String> _fieldLabels = {
    'requestNumber': '№ заявки',
    'requestDate': 'Дата заявки',
    'status': 'Статус заявки',
    'executorWorkStatus': 'Статус виконавця',
    'company': 'Компанія виконавець',
    'serviceRegion': 'Регіон сервісного відділу',
    'edrpou': 'ЄДРПОУ',
    'client': 'Замовник',
    'address': 'Адреса',
    'requestDesc': 'Опис заявки',
    'plannedDate': 'Запланована дата робіт',
    'contactPerson': 'Контактна особа',
    'contactPhone': 'Тел. контактної особи',
    'equipment': 'Тип обладнання',
    'equipmentSerial': 'Заводський номер обладнання',
    'engineModel': 'Модель двигуна',
    'engineSerial': 'Зав. № двигуна',
    'customerEquipmentNumber': 'Інв. № обладнання від замовника',
    'work': 'Виконані роботи',
    'date': 'Дата проведення робіт',
    'engineer1': 'Сервісний інженер №1',
    'engineer2': 'Сервісний інженер №2',
    'engineer3': 'Сервісний інженер №3',
    'engineer4': 'Сервісний інженер №4',
    'engineer5': 'Сервісний інженер №5',
    'engineer6': 'Сервісний інженер №6',
    'serviceTotal': 'Загальна сума послуги',
    'workPrice': 'Вартість робіт, грн',
    'paymentType': 'Вид оплати',
    'paymentDate': 'Дата оплати',
    'invoice': 'Номер рахунку',
    'invoiceRecipientDetails': 'Реквізити отримувача рахунку',
    'oilType': 'Тип оливи',
    'oilUsed': 'Використано оливи, л',
    'oilPrice': 'Ціна оливи за 1 л, грн',
    'oilTotal': 'Загальна сума за оливу, грн',
    'filterName': 'Фільтр масляний назва',
    'filterCount': 'Фільтр масляний штук',
    'filterPrice': 'Ціна масляного фільтра',
    'filterSum': 'Сума за фільтри масляні',
    'fuelFilterName': 'Фільтр паливний назва',
    'fuelFilterCount': 'Фільтр паливний штук',
    'fuelFilterPrice': 'Ціна паливного фільтра',
    'fuelFilterSum': 'Сума за фільтри паливні',
    'airFilterName': 'Фільтр повітряний назва',
    'airFilterCount': 'Фільтр повітряний штук',
    'airFilterPrice': 'Ціна повітряного фільтра',
    'airFilterSum': 'Сума за фільтри повітряні',
    'antifreezeType': 'Антифриз тип',
    'antifreezeL': 'Антифриз, л',
    'antifreezePrice': 'Ціна антифризу',
    'antifreezeSum': 'Сума за антифриз',
    'otherMaterials': 'Опис інших матеріалів',
    'otherSum': 'Ціна інших матеріалів',
    'materials': 'Матеріали',
    'carNumber': 'Держномер авто',
    'transportKm': 'Кілометраж',
    'transportSum': 'Вартість транспорту',
    'perDiem': 'Добові, грн',
    'living': 'Проживання, грн',
    'otherExp': 'Інші витрати, грн',
    'serviceBonus': 'Премія за сервіс, грн',
    'approvedByWarehouse': 'Підтвердження зав. складу',
    'warehouseApprovalDate': 'Дата підтвердження зав. складу',
    'warehouseComment': 'Опис відмови (зав. склад)',
    'approvedByAccountant': 'Підтвердження бухгалтера',
    'accountantComment': 'Опис відмови (бухгалтер)',
    'accountantComments': 'Коментарі бухгалтера',
    'approvedByRegionalManager': 'Підтвердження рег. керівника',
    'regionalManagerComment': 'Опис відмови (рег. керівник)',
    'comments': 'Коментарі',
    'approvalDate': 'Дата затвердження',
    'bonusApprovalDate': 'Дата затвердження премії',
    'reportMonthYear': 'Місяць/рік для звіту',
    'blockDetail': 'Детальний опис блокування заявки',
    'needInvoice': 'Потрібен рахунок',
    'needAct': 'Потрібен акт виконаних робіт',
    'debtStatus': 'Заборгованість по актах',
    'autoCreatedAt': 'Авт. створення заявки',
    'autoCompletedAt': 'Авт. виконано',
    'autoWarehouseApprovedAt': 'Авт. затвердження завскладом',
    'autoAccountantApprovedAt': 'Авт. затвердження бухгалтером',
    'invoiceRequestDate': 'Дата заявки на рахунок',
    'invoiceUploadDate': 'Дата завантаження рахунку',
    'requestAuthor': 'Автор заявки',
    'urgent': 'Термінова заявка',
    'internalWork': 'Внутрішні роботи',
  };

  static const List<String> _fieldOrder = [
    'requestNumber', 'requestDate', 'status', 'executorWorkStatus', 'company', 'serviceRegion',
    'requestAuthor', 'edrpou', 'client', 'address', 'requestDesc',
    'plannedDate', 'contactPerson', 'contactPhone', 'urgent', 'internalWork',
    'equipment', 'equipmentSerial', 'engineModel', 'engineSerial',
    'customerEquipmentNumber', 'work', 'date',
    'engineer1', 'engineer2', 'engineer3', 'engineer4', 'engineer5', 'engineer6',
    'serviceTotal', 'workPrice', 'paymentType', 'paymentDate', 'invoice',
    'invoiceRecipientDetails', 'oilType', 'oilUsed', 'oilPrice', 'oilTotal',
    'filterName', 'filterCount', 'filterPrice', 'filterSum',
    'fuelFilterName', 'fuelFilterCount', 'fuelFilterPrice', 'fuelFilterSum',
    'airFilterName', 'airFilterCount', 'airFilterPrice', 'airFilterSum',
    'antifreezeType', 'antifreezeL', 'antifreezePrice', 'antifreezeSum',
    'otherMaterials', 'otherSum', 'materials', 'carNumber',
    'transportKm', 'transportSum', 'perDiem', 'living', 'otherExp', 'serviceBonus',
    'approvedByWarehouse', 'warehouseApprovalDate', 'warehouseComment',
    'approvedByAccountant', 'accountantComment', 'accountantComments',
    'approvedByRegionalManager', 'regionalManagerComment',
    'comments', 'approvalDate', 'bonusApprovalDate', 'reportMonthYear',
    'blockDetail', 'needInvoice', 'needAct', 'debtStatus',
    'autoCreatedAt', 'autoCompletedAt', 'autoWarehouseApprovedAt',
    'autoAccountantApprovedAt', 'invoiceRequestDate', 'invoiceUploadDate',
  ];

  @override
  void initState() {
    super.initState();
    unawaited(AssignedInboxService.instance.upsertTask(widget.task));
    _loadPendingComplete();
    _loadFullTask();
    _loadFiles();
    _loadPendingPhotos();
  }

  Future<void> _loadPendingComplete() async {
    final pending =
        await AssignedInboxService.instance.isPendingComplete(widget.task.id);
    if (!mounted) return;
    setState(() => _pendingComplete = pending);
  }

  Future<void> _loadFullTask() async {
    final cached = await TaskService.instance.loadCachedTask(widget.task.id);
    if (cached != null && mounted) {
      setState(() {
        _fullTask = cached;
        _loadingDetails = false;
      });
    }
    if (ConnectivityService.instance.isOffline) {
      if (mounted) setState(() => _loadingDetails = false);
      return;
    }
    if (cached == null && mounted) {
      setState(() {
        _loadingDetails = true;
      });
    }
    try {
      final data = await TaskService.instance.fetchTask(widget.task.id);
      await AssignedInboxService.instance.upsertMap(data);
      if (mounted) {
        setState(() {
          _fullTask = data;
        });
      }
    } catch (_) {
      // Офлайн або збій мережі: показуємо вже завантажену заявку.
    } finally {
      if (mounted) {
        setState(() {
          _loadingDetails = false;
        });
      }
    }
  }

  Future<void> _loadPendingPhotos() async {
    final pending =
        await OfflineSyncService.instance.pendingPhotosForTask(widget.task.id);
    if (!mounted) return;
    setState(() => _pendingPhotos = pending);
  }

  Future<void> _loadFiles() async {
    try {
      final files = await FileService.instance.fetchTaskFiles(widget.task.id);
      if (mounted) {
        setState(() {
          _files = files;
        });
      }
    } catch (_) {
      // Файли з сервера недоступні офлайн — лишаємо локальні копії.
    }
  }

  bool get _isAlreadyCompleted {
    final fromFull = _fullTask?['executorWorkStatus']?.toString();
    return fromFull == 'Виконавець виконав роботу' || widget.task.isExecutorCompleted;
  }

  bool get _canCompleteAsExecutor {
    if (_pendingComplete || _isAlreadyCompleted) return false;
    final login = AuthService.instance.userLogin;
    if (login == null || login.isEmpty) return false;
    final assigned = _fullTask?['assignedExecutorLogin']?.toString() ??
        widget.task.assignedExecutorLogin;
    return assigned != null &&
        assigned.toLowerCase() == login.toLowerCase();
  }

  Future<void> _confirmAndComplete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Заявка виконана'),
        content: const Text(
          'Якщо зараз немає інтернету, заявка лишиться в списку жовтим кольором, поки не синхронізується з базою. Ви впевнені, що все виконали?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Скасувати'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Так, закрити'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    setState(() {
      _completing = true;
      _error = null;
    });
    try {
      if (ConnectivityService.instance.isOffline) {
        await OfflineSyncService.instance.enqueueComplete(widget.task.id);
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Заявку виконано локально. Чекаємо інтернет та синхронізації з базою',
            ),
          ),
        );
        Navigator.of(context).pop(true);
        return;
      }
      await TaskService.instance.completeAssignedTask(widget.task.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Заявку закрито. Вона зникла з вашого списку')),
      );
      Navigator.of(context).pop(true);
    } catch (error) {
      await OfflineSyncService.instance.enqueueComplete(widget.task.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Немає зв’язку з сервером. Заявку виконано локально, чекаємо синхронізації',
          ),
        ),
      );
      Navigator.of(context).pop(true);
    } finally {
      if (mounted) {
        setState(() {
          _completing = false;
        });
      }
    }
  }

  Future<void> _openCameraSession() async {
    final uploaded = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => PhotoCaptureSessionScreen(taskId: widget.task.id),
      ),
    );
    if (!mounted) return;
    await _loadPendingPhotos();
    await _loadFiles();
    if (!mounted) return;
    if (uploaded == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            ConnectivityService.instance.isOffline
                ? 'Фото додано до заявки. Відправляться, коли з’явиться інтернет'
                : 'Фото додано до заявки',
          ),
        ),
      );
    }
  }

  Future<void> _pickAndUpload(ImageSource source) async {
    setState(() {
      _uploading = true;
      _error = null;
    });
    try {
      final picker = ImagePicker();
      final file = await picker.pickImage(
        source: source,
        imageQuality: 85,
      );
      if (file == null) {
        setState(() {
          _uploading = false;
        });
        return;
      }
      final backup = await OfflineSyncService.instance.keepDeviceCopy(
        taskId: widget.task.id,
        file: file,
      );
      final toUpload = XFile(backup.path, name: file.name);
      final offline = ConnectivityService.instance.isOffline;
      if (offline) {
        await OfflineSyncService.instance.enqueuePhoto(
          taskId: widget.task.id,
          file: toUpload,
        );
      } else {
        try {
          await FileService.instance.uploadTaskFiles(
            taskId: widget.task.id,
            files: [toUpload],
          );
          await _loadFiles();
        } catch (_) {
          await OfflineSyncService.instance.enqueuePhoto(
            taskId: widget.task.id,
            file: toUpload,
          );
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text(
                  'Немає зв’язку з сервером. Фото збережено на телефоні і відправиться пізніше',
                ),
              ),
            );
          }
          await _loadPendingPhotos();
          return;
        }
      }
      await _loadPendingPhotos();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            offline
                ? 'Фото додано до заявки. Відправиться, коли з’явиться інтернет'
                : 'Фото додано до заявки',
          ),
        ),
      );
    } catch (error) {
      if (!mounted) return;
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

  bool _isImageFile(Map<String, dynamic> file) {
    final mimetype = file['mimetype']?.toString().toLowerCase() ?? '';
    if (mimetype.startsWith('image/')) return true;
    final name = file['originalName']?.toString().toLowerCase() ?? '';
    const ext = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    return ext.any((e) => name.endsWith(e));
  }

  List<_ImageItem> _allImageItems() {
    final items = <_ImageItem>[];
    for (final file in _displayFiles) {
      if (!_isImageFile(file)) continue;
      final localPath = file['localPath']?.toString() ?? '';
      final url = file['cloudinaryUrl']?.toString() ?? '';
      if (localPath.isNotEmpty) {
        items.add(_ImageItem(
          localPath: localPath,
          name: file['originalName']?.toString() ?? 'Фото',
        ));
      } else if (url.isNotEmpty) {
        items.add(_ImageItem(
          url: url,
          name: file['originalName']?.toString() ?? 'Фото',
        ));
      }
    }
    return items;
  }

  void _openFileOrImage({
    required String url,
    required bool isImage,
    String? name,
    String? localPath,
  }) {
    if (isImage) {
      final imageItems = _allImageItems();
      var initialIndex = 0;
      if (localPath != null && localPath.isNotEmpty) {
        initialIndex = imageItems.indexWhere((e) => e.localPath == localPath);
      } else {
        initialIndex = imageItems.indexWhere((e) => e.url == url);
      }
      final startIndex = initialIndex >= 0 ? initialIndex : 0;
      if (imageItems.isEmpty) return;
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => _FullScreenImageCarousel(
            items: imageItems,
            initialIndex: startIndex,
          ),
        ),
      );
      return;
    }
    if (url.isEmpty) return;
    final uri = Uri.parse(url);
    launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Widget _buildFilesSection() {
    final files = _displayFiles;
    if (files.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Фото заявки (${files.length})',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
        ),
        const SizedBox(height: 12),
        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 0.85,
          ),
          itemCount: files.length,
          itemBuilder: (context, index) {
            final file = files[index];
            final url = file['cloudinaryUrl']?.toString() ?? '';
            final localPath = file['localPath']?.toString() ?? '';
            final name = file['originalName']?.toString() ?? 'Файл';
            final isImage = _isImageFile(file);
            final pending = file['pending'] == true;
            final localFile = localPath.isNotEmpty ? File(localPath) : null;
            return InkWell(
              onTap: () => _openFileOrImage(
                url: url,
                isImage: isImage,
                name: name,
                localPath: localPath.isNotEmpty ? localPath : null,
              ),
              borderRadius: BorderRadius.circular(8),
              child: Container(
                decoration: BoxDecoration(
                  border: Border.all(color: Colors.grey.shade300),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(
                      child: ClipRRect(
                        borderRadius: const BorderRadius.vertical(
                            top: Radius.circular(7)),
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            if (isImage && localFile != null)
                              Image.file(
                                localFile,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => const Center(
                                  child: Icon(Icons.broken_image, size: 48),
                                ),
                              )
                            else if (isImage && url.isNotEmpty)
                              Image.network(
                                url,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => const Center(
                                  child: Icon(Icons.broken_image, size: 48),
                                ),
                              )
                            else
                              Center(
                                child: Icon(
                                  Icons.insert_drive_file,
                                  size: 48,
                                  color: Colors.grey.shade600,
                                ),
                              ),
                            if (pending)
                              Align(
                                alignment: Alignment.bottomLeft,
                                child: Container(
                                  margin: const EdgeInsets.all(6),
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 6,
                                    vertical: 2,
                                  ),
                                  color: Colors.orange.shade700,
                                  child: const Text(
                                    'очікує відправки',
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontSize: 10,
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.all(8),
                      child: Text(
                        name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ],
    );
  }

  /// Значення поля з повної заявки; якщо API не повернув дані — з widget.task.
  String? _value(String key) {
    final task = widget.task;
    if (_fullTask != null) {
      final raw = _fullTask![key];
      if (raw == null) {
        // Резерв з моделі Task для основних полів
        final fallback = _taskField(task, key);
        if (fallback != null) return fallback;
        return null;
      }
      if (raw is bool) return raw ? 'Так' : 'Ні';
      final s = raw.toString().trim();
      return s.isEmpty ? null : s;
    }
    return _taskField(task, key);
  }

  String? _taskField(Task task, String key) {
    switch (key) {
      case 'requestNumber':
        return task.requestNumber?.trim().isEmpty == true ? null : task.requestNumber;
      case 'requestDate':
        return task.requestDate?.trim().isEmpty == true ? null : task.requestDate;
      case 'status':
        return task.status.trim().isEmpty ? null : task.status;
      case 'executorWorkStatus':
        return task.executorWorkStatus?.trim().isEmpty == true ? null : task.executorWorkStatus;
      case 'client':
        return task.client?.trim().isEmpty == true ? null : task.client;
      case 'requestDesc':
        return task.requestDesc?.trim().isEmpty == true ? null : task.requestDesc;
      case 'serviceRegion':
        return task.serviceRegion?.trim().isEmpty == true ? null : task.serviceRegion;
      case 'work':
        return task.work?.trim().isEmpty == true ? null : task.work;
      case 'materials':
        return task.materials?.trim().isEmpty == true ? null : task.materials;
      case 'comments':
        return task.comments?.trim().isEmpty == true ? null : task.comments;
      case 'workPrice':
        return task.workPrice?.trim().isEmpty == true ? null : task.workPrice;
      case 'transportKm':
        return task.transportKm?.trim().isEmpty == true ? null : task.transportKm;
      case 'transportSum':
        return task.transportSum?.trim().isEmpty == true ? null : task.transportSum;
      default:
        return null;
    }
  }

  /// Віджет одного поля (тільки якщо значення не пусте).
  Widget? _buildFieldRow(String key) {
    final value = _value(key);
    if (value == null) return null;
    final label = _fieldLabels[key] ?? key;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Colors.grey,
                  fontWeight: FontWeight.w500,
                ),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final task = widget.task;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Деталі заявки'),
      ),
      body: SafeArea(
        child: _loadingDetails
            ? const Center(child: CircularProgressIndicator())
            : SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // --- Заявка (основний блок) ---
                    Text(
                      'Заявка',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                            color: Theme.of(context).colorScheme.primary,
                          ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _value('requestNumber') ?? task.requestNumber ?? 'Без номера',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    if (_value('requestDate') != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        _value('requestDate')!,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: Colors.grey,
                            ),
                      ),
                    ],
                    if (_value('status') != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        _value('status')!,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                      ),
                    ],
                    if (_value('client') != null) ...[
                      const SizedBox(height: 6),
                      Text(
                        _value('client')!,
                        style: Theme.of(context).textTheme.bodyLarge,
                      ),
                    ],
                    if (_value('requestDesc') != null) ...[
                      const SizedBox(height: 6),
                      Text(
                        _value('requestDesc')!,
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ],
                    const SizedBox(height: 20),
                    if (_pendingComplete)
                      Container(
                        width: double.infinity,
                        margin: const EdgeInsets.only(bottom: 16),
                        padding: const EdgeInsets.all(12),
                        color: const Color(0xFFFFF59D),
                        child: const Text(
                          'Заявку виконано. Чекаємо інтернет та синхронізації з базою',
                          style: TextStyle(
                            color: Colors.black,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(
                          _error!,
                          style: TextStyle(color: Colors.red.shade700),
                        ),
                      ),
                    // --- Решта полів (крім пустих) ---
                    ..._fieldOrder
                        .where((k) =>
                            k != 'requestNumber' &&
                            k != 'requestDate' &&
                            k != 'status' &&
                            k != 'client' &&
                            k != 'requestDesc')
                        .map((k) => _buildFieldRow(k))
                        .whereType<Widget>(),
                    const SizedBox(height: 20),
                    // --- Додати фото (єдине дозволене редагування) ---
                    Text(
                      'Додати фото / файли',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: _uploading ? null : _openCameraSession,
                            icon: const Icon(Icons.photo_camera),
                            label: const Text('Камера'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: _uploading
                                ? null
                                : () => _pickAndUpload(ImageSource.gallery),
                            icon: const Icon(Icons.photo_library),
                            label: const Text('Галерея'),
                          ),
                        ),
                      ],
                    ),
                    if (_uploading)
                      const Padding(
                        padding: EdgeInsets.only(top: 16),
                        child: LinearProgressIndicator(),
                      ),
                    if (_displayFiles.isNotEmpty) ...[
                      const SizedBox(height: 20),
                      _buildFilesSection(),
                    ],
                    if (_canCompleteAsExecutor) ...[
                      const SizedBox(height: 24),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton(
                          onPressed: (_uploading || _completing) ? null : _confirmAndComplete,
                          child: _completing
                              ? const SizedBox(
                                  width: 22,
                                  height: 22,
                                  child: CircularProgressIndicator(strokeWidth: 2),
                                )
                              : const Text('Заявка виконана'),
                        ),
                      ),
                    ],
                    const SizedBox(height: 24),
                  ],
                ),
              ),
      ),
    );
  }
}

/// Елемент каруселі (url або локальний файл + назва).
class _ImageItem {
  const _ImageItem({this.url = '', this.localPath, required this.name});
  final String url;
  final String? localPath;
  final String name;
}

/// Повноекранна карусель зображень (як у формі менеджерів).
class _FullScreenImageCarousel extends StatefulWidget {
  const _FullScreenImageCarousel({
    required this.items,
    required this.initialIndex,
  });

  final List<_ImageItem> items;
  final int initialIndex;

  @override
  State<_FullScreenImageCarousel> createState() =>
      _FullScreenImageCarouselState();
}

class _FullScreenImageCarouselState extends State<_FullScreenImageCarousel> {
  late PageController _pageController;
  late ValueNotifier<int> _currentIndexNotifier;

  @override
  void initState() {
    super.initState();
    _pageController = PageController(initialPage: widget.initialIndex);
    _currentIndexNotifier = ValueNotifier<int>(widget.initialIndex);
  }

  @override
  void dispose() {
    _pageController.dispose();
    _currentIndexNotifier.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final items = widget.items;
    if (items.isEmpty) {
      return const Scaffold(
        backgroundColor: Colors.black,
        body: Center(
          child: Text(
            'Немає зображень',
            style: TextStyle(color: Colors.white54),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: ValueListenableBuilder<int>(
          valueListenable: _currentIndexNotifier,
          builder: (context, index, _) {
            final item = items[index];
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  '${index + 1} / ${items.length}',
                  style: const TextStyle(color: Colors.white70, fontSize: 14),
                ),
                Text(
                  item.name,
                  style: const TextStyle(color: Colors.white, fontSize: 16),
                  overflow: TextOverflow.ellipsis,
                  maxLines: 1,
                ),
              ],
            );
          },
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(32),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: ValueListenableBuilder<int>(
                valueListenable: _currentIndexNotifier,
                builder: (context, current, _) {
                  return Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(
                      items.length,
                      (i) => Container(
                        width: current == i ? 10 : 6,
                        height: 6,
                        margin: const EdgeInsets.symmetric(horizontal: 3),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: current == i ? Colors.white : Colors.white38,
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
        ),
      ),
      body: PageView.builder(
        controller: _pageController,
        itemCount: items.length,
        onPageChanged: (index) => _currentIndexNotifier.value = index,
        itemBuilder: (context, index) {
          final item = items[index];
          return LayoutBuilder(
            builder: (context, constraints) {
              return InteractiveViewer(
                minScale: 0.5,
                maxScale: 4.0,
                child: SizedBox(
                  width: constraints.maxWidth,
                  height: constraints.maxHeight,
                  child: item.localPath != null && item.localPath!.isNotEmpty
                      ? Image.file(
                          File(item.localPath!),
                          fit: BoxFit.contain,
                          errorBuilder: (_, __, ___) => const Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.broken_image, size: 64, color: Colors.white54),
                                SizedBox(height: 16),
                                Text(
                                  'Не вдалося відкрити зображення',
                                  style: TextStyle(color: Colors.white54),
                                ),
                              ],
                            ),
                          ),
                        )
                      : Image.network(
                    item.url,
                    fit: BoxFit.contain,
                loadingBuilder: (context, child, loadingProgress) {
                  if (loadingProgress == null) return child;
                  return Center(
                    child: CircularProgressIndicator(
                      value: loadingProgress.expectedTotalBytes != null
                          ? loadingProgress.cumulativeBytesLoaded /
                              (loadingProgress.expectedTotalBytes ?? 1)
                          : null,
                      color: Colors.white,
                    ),
                  );
                },
                    errorBuilder: (_, __, ___) => const Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.broken_image, size: 64, color: Colors.white54),
                          SizedBox(height: 16),
                          Text(
                            'Не вдалося завантажити зображення',
                            style: TextStyle(color: Colors.white54),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
