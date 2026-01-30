import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/models/task.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/file_service.dart';
import '../../core/services/task_service.dart';
import 'package:url_launcher/url_launcher.dart';

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
  String? _error;
  List<Map<String, dynamic>> _files = [];

  /// Порядок і підписи полів (як у веб-версії). Порожні не показуємо.
  static const Map<String, String> _fieldLabels = {
    'requestNumber': '№ заявки',
    'requestDate': 'Дата заявки',
    'status': 'Статус заявки',
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
    'requestNumber', 'requestDate', 'status', 'company', 'serviceRegion',
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
    _loadFullTask();
    _loadFiles();
  }

  Future<void> _loadFullTask() async {
    setState(() {
      _loadingDetails = true;
      _error = null;
    });
    try {
      final data = await TaskService.instance.fetchTask(widget.task.id);
      if (mounted) {
        setState(() {
          _fullTask = data;
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _error = AuthService.parseError(error);
          _fullTask = null;
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _loadingDetails = false;
        });
      }
    }
  }

  Future<void> _loadFiles() async {
    try {
      final files = await FileService.instance.fetchTaskFiles(widget.task.id);
      if (mounted) {
        setState(() {
          _files = files;
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _error = AuthService.parseError(error);
        });
      }
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
      await FileService.instance.uploadTaskFiles(
        taskId: widget.task.id,
        files: [file],
      );
      await _loadFiles();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Фото завантажено')),
      );
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = AuthService.parseError(error);
      });
    } finally {
      setState(() {
        _uploading = false;
      });
    }
  }

  bool _isImageFile(Map<String, dynamic> file) {
    final mimetype = file['mimetype']?.toString().toLowerCase() ?? '';
    if (mimetype.startsWith('image/')) return true;
    final name = file['originalName']?.toString().toLowerCase() ?? '';
    const ext = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    return ext.any((e) => name.endsWith(e));
  }

  void _openFileOrImage({
    required String url,
    required bool isImage,
    String? name,
  }) {
    if (isImage) {
      final imageItems = _files
          .where((f) => (f['cloudinaryUrl']?.toString() ?? '').isNotEmpty)
          .where(_isImageFile)
          .map((f) => _ImageItem(
                url: f['cloudinaryUrl']?.toString() ?? '',
                name: f['originalName']?.toString() ?? 'Фото',
              ))
          .toList();
      final initialIndex = imageItems.indexWhere((e) => e.url == url);
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
    if (_files.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Файли (${_files.length})',
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
          itemCount: _files.length,
          itemBuilder: (context, index) {
            final file = _files[index];
            final url = file['cloudinaryUrl']?.toString() ?? '';
            final name = file['originalName']?.toString() ?? 'Файл';
            final isImage = _isImageFile(file);
            return InkWell(
              onTap: () => _openFileOrImage(
                url: url,
                isImage: isImage,
                name: name,
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
                        child: isImage && url.isNotEmpty
                            ? Image.network(
                                url,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => const Center(
                                  child: Icon(Icons.broken_image, size: 48),
                                ),
                              )
                            : Center(
                                child: Icon(
                                  Icons.insert_drive_file,
                                  size: 48,
                                  color: Colors.grey.shade600,
                                ),
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
                            onPressed: _uploading
                                ? null
                                : () => _pickAndUpload(ImageSource.camera),
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
                    if (_files.isNotEmpty) ...[
                      const SizedBox(height: 20),
                      _buildFilesSection(),
                    ],
                    const SizedBox(height: 24),
                  ],
                ),
              ),
      ),
    );
  }
}

/// Елемент каруселі (url + назва).
class _ImageItem {
  const _ImageItem({required this.url, required this.name});
  final String url;
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
          return InteractiveViewer(
            minScale: 0.5,
            maxScale: 4.0,
            child: Center(
              child: Image.network(
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
      ),
    );
  }
}
