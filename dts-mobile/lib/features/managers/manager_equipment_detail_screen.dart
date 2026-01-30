import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/models/equipment.dart';
import '../../core/services/auth_service.dart';
import '../../core/services/equipment_service.dart';

/// Детальна інформація по обладнанню для панелі Менеджери (як у веб-застосунку).
class ManagerEquipmentDetailScreen extends StatefulWidget {
  const ManagerEquipmentDetailScreen({
    super.key,
    required this.equipment,
  });

  final Equipment equipment;

  @override
  State<ManagerEquipmentDetailScreen> createState() =>
      _ManagerEquipmentDetailScreenState();
}

class _ManagerEquipmentDetailScreenState
    extends State<ManagerEquipmentDetailScreen> {
  Map<String, dynamic>? _fullDetails;
  bool _loading = true;
  String? _error;
  bool _requestingTesting = false;

  @override
  void initState() {
    super.initState();
    _loadDetails();
  }

  Future<void> _loadDetails() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data =
          await EquipmentService.instance.fetchEquipmentById(widget.equipment.id);
      setState(() {
        _fullDetails = data;
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

  bool get _canRequestTesting {
    final eq = widget.equipment;
    final status = eq.status ?? '';
    final testingStatus = eq.testingStatus ?? '';
    if (status == 'deleted' || status == 'written_off') return false;
    if (testingStatus == 'requested' ||
        testingStatus == 'in_progress' ||
        testingStatus == 'completed' ||
        testingStatus == 'failed') return false;
    return status == 'in_stock' || status == 'reserved';
  }

  Future<void> _requestTesting() async {
    if (!_canRequestTesting) return;
    setState(() {
      _requestingTesting = true;
      _error = null;
    });
    try {
      await EquipmentService.instance.requestTesting(widget.equipment.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Заявку на тестування подано')),
      );
      _loadDetails();
    } catch (error) {
      setState(() {
        _error = AuthService.parseError(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _requestingTesting = false;
        });
      }
    }
  }

  static const _statusLabels = {
    'in_stock': 'На складі',
    'reserved': 'Зарезервовано',
    'shipped': 'Відвантажено',
    'in_transit': 'В дорозі',
    'written_off': 'Списано',
    'deleted': 'Видалено',
  };

  static const _testingStatusLabels = {
    'requested': 'Заявка на тестування',
    'in_progress': 'В тестуванні',
    'completed': 'Пройшло',
    'failed': 'Не пройшло',
  };

  /// Висновок тесту: passed/failed → українською для користувача.
  static String? _formatConclusion(String? value) {
    if (value == null || value.isEmpty) return null;
    final v = value.trim().toLowerCase();
    if (v == 'passed') return 'Пройшло';
    if (v == 'failed') return 'Не пройшло';
    return value;
  }

  /// Використані при тесті матеріали — читабельний список замість JSON.
  List<Widget> _buildTestingMaterialsRows() {
    List<Map<String, dynamic>>? items;
    final rawArray = _fullDetails?['testingMaterialsArray'];
    if (rawArray is List) {
      items = rawArray.whereType<Map<String, dynamic>>().toList();
    }
    if (items == null || items.isEmpty) {
      final rawJson = _fullDetails?['testingMaterialsJson'];
      if (rawJson is String && rawJson.trim().isNotEmpty) {
        try {
          final decoded = jsonDecode(rawJson);
          if (decoded is List) {
            items = decoded.whereType<Map<String, dynamic>>().toList();
          }
        } catch (_) {}
      }
    }
    if (items == null || items.isEmpty) {
      final text = widget.equipment.testingMaterials ?? _fullDetails?['testingMaterials']?.toString();
      if (text != null && text.isNotEmpty) {
        return [_row('Використані матеріали', text)];
      }
      return [];
    }
    final rows = <Widget>[
      Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Text(
          'Використані матеріали при тесті:',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Colors.grey.shade700,
                fontWeight: FontWeight.w500,
              ),
        ),
      ),
    ];
    for (final item in items) {
      final type = item['type']?.toString() ?? '—';
      final qty = item['quantity']?.toString() ?? '';
      final unit = item['unit']?.toString() ?? '';
      final line = qty.isNotEmpty && unit.isNotEmpty
          ? '$type — $qty $unit'
          : type;
      rows.add(Padding(
        padding: const EdgeInsets.only(left: 16, bottom: 4),
        child: Text(line, style: Theme.of(context).textTheme.bodyMedium),
      ));
    }
    return rows;
  }

  /// Форматує ISO-дату в читабельний вигляд (дд.мм.рррр гг:хх).
  static String? _formatDate(String? value) {
    if (value == null || value.isEmpty) return null;
    final d = DateTime.tryParse(value);
    if (d == null) return value;
    final day = d.day.toString().padLeft(2, '0');
    final month = d.month.toString().padLeft(2, '0');
    final year = d.year;
    final hour = d.hour.toString().padLeft(2, '0');
    final minute = d.minute.toString().padLeft(2, '0');
    return '$day.$month.$year $hour:$minute';
  }

  /// Для значень з API: якщо це дата — форматуємо, інакше повертаємо як є.
  static String _formatValue(String key, Object? value) {
    if (value == null) return '';
    final s = value.toString();
    if (s.isEmpty) return '';
    final lowerKey = key.toLowerCase();
    final isDateField = lowerKey.endsWith('at') ||
        lowerKey.endsWith('date') ||
        lowerKey == 'createdat' ||
        lowerKey == 'updatedat' ||
        lowerKey == 'reservationenddate' ||
        lowerKey == 'manufacturedate' ||
        lowerKey == 'testingdate' ||
        lowerKey == 'testingrequestedat' ||
        lowerKey == 'testingtakenat' ||
        lowerKey == 'uploadedat' ||
        lowerKey == 'addedat' ||
        lowerKey == 'lastmodified';
    if (isDateField && s.length >= 10 && (s.contains('T') || s.contains('-'))) {
      final formatted = _formatDate(s);
      if (formatted != null) return formatted;
    }
    return s;
  }

  @override
  Widget build(BuildContext context) {
    final eq = widget.equipment;

    return Scaffold(
      appBar: AppBar(
        title: Text(eq.serialNumber ?? eq.type ?? 'Обладнання'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text(_error!))
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (_canRequestTesting) ...[
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton.icon(
                            onPressed: _requestingTesting
                                ? null
                                : _requestTesting,
                            icon: _requestingTesting
                                ? const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2),
                                  )
                                : const Icon(Icons.science),
                            label: const Text('Подати заявку на тестування'),
                          ),
                        ),
                        const SizedBox(height: 20),
                      ],
                      _section('Основна інформація', [
                        _row('Тип', eq.type),
                        _row('Серійний номер', eq.serialNumber),
                        _row('Виробник', _fullDetails?['manufacturer']?.toString() ?? eq.manufacturer),
                        _row('Кількість', eq.quantity?.toString()),
                        _row('Статус', _statusLabels[eq.status] ?? eq.status),
                        _row('Склад', eq.currentWarehouseName ?? eq.currentWarehouse),
                      ]),
                      if (eq.status == 'reserved') ...[
                        const SizedBox(height: 16),
                        _section('Резервування', [
                          _row('Клієнт', eq.reservationClientName ?? _fullDetails?['reservationClientName']?.toString()),
                          _row('Зарезервував', eq.reservedByName ?? _fullDetails?['reservedByName']?.toString()),
                          _row('До дати', _formatDate(eq.reservationEndDate ?? _fullDetails?['reservationEndDate']?.toString())),
                        ]),
                      ],
                      if ((eq.testingStatus ?? '').isNotEmpty) ...[
                        const SizedBox(height: 16),
                        _section('Тестування', [
                          _row('Статус', _testingStatusLabels[eq.testingStatus] ?? eq.testingStatus),
                          _row('Результат', eq.testingResult),
                          _row('Висновок', _formatConclusion(eq.testingConclusion ?? _fullDetails?['testingConclusion']?.toString())),
                          _row('Примітки', eq.testingNotes),
                          ..._buildTestingMaterialsRows(),
                          _row('Інженер 1', eq.engineer1),
                          _row('Інженер 2', eq.engineer2),
                          _row('Інженер 3', eq.engineer3),
                          _row('Процедура тестування', eq.testingProcedure ?? _fullDetails?['testingProcedure']?.toString()),
                        ]),
                      ],
                      if (_fullDetails != null) ...[
                        if (_attachedFiles.isNotEmpty) ...[
                          const SizedBox(height: 16),
                          _buildAttachedFilesSection(),
                        ],
                        if (_testingFiles.isNotEmpty) ...[
                          const SizedBox(height: 16),
                          _buildTestingFilesSection(),
                        ],
                        const SizedBox(height: 16),
                        _section('Додаткові поля', _extraFields()),
                      ],
                    ],
                  ),
                ),
    );
  }

  List<Map<String, dynamic>> get _attachedFiles {
    final raw = _fullDetails?['attachedFiles'];
    if (raw is! List) return [];
    return raw
        .whereType<Map<String, dynamic>>()
        .where((f) => f['cloudinaryUrl']?.toString().isNotEmpty == true)
        .toList();
  }

  List<Map<String, dynamic>> get _testingFiles {
    final raw = _fullDetails?['testingFiles'];
    if (raw is! List) return [];
    return raw
        .whereType<Map<String, dynamic>>()
        .where((f) => f['cloudinaryUrl']?.toString().isNotEmpty == true)
        .toList();
  }

  /// Зображення — карусель у повноекранному режимі. Інші файли — спроба відкрити в браузері.
  void _openFileOrImage({
    required List<Map<String, dynamic>> files,
    required int tappedIndex,
    required String url,
    required bool isImage,
    String? name,
  }) {
    if (isImage) {
      final imageItems = files
          .where((f) => (f['mimetype']?.toString() ?? '').startsWith('image/'))
          .where((f) => (f['cloudinaryUrl']?.toString() ?? '').isNotEmpty)
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
    _openFileUrl(url);
  }

  Future<void> _openFileUrl(String url) async {
    if (url.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Посилання відсутнє')),
      );
      return;
    }
    final uri = Uri.parse(url);
    try {
      final launched = await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );
      if (!launched && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Не вдалося відкрити посилання')),
        );
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Не вдалося відкрити посилання')),
      );
    }
  }

  Widget _buildAttachedFilesSection() {
    final files = _attachedFiles;
    if (files.isEmpty) return const SizedBox.shrink();
    return _buildFileGrid(files, 'Документи та фото (${files.length})');
  }

  Widget _buildTestingFilesSection() {
    final files = _testingFiles;
    if (files.isEmpty) return const SizedBox.shrink();
    return _buildFileGrid(files, 'Файли тестування (${files.length})');
  }

  Widget _buildFileGrid(List<Map<String, dynamic>> files, String title) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
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
            final name = file['originalName']?.toString() ?? 'Файл';
            final mimetype = file['mimetype']?.toString() ?? '';
            final isImage = mimetype.startsWith('image/');
            return InkWell(
              onTap: () => _openFileOrImage(
                files: files,
                tappedIndex: index,
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
                        child: isImage
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

  List<Widget> _extraFields() {
    // Приховуємо технічні поля з БД (ID, масиви, внутрішні ключі).
    const skip = {
      '_id', 'id', 'type', 'serialNumber', 'status', 'currentWarehouse',
      'currentWarehouseName', 'manufacturer', 'quantity', 'batchId',
      'reservedByName', 'reservationClientName', 'reservationEndDate',
      'reservedBy', 'reservedAt', 'reservationNotes',
      'testingStatus', 'testingResult', 'testingConclusion', 'testingNotes',
      'testingMaterials', 'testingMaterialsArray', 'testingMaterialsJson',
      'engineer1', 'engineer2', 'engineer3',
      'testingEngineer1', 'testingEngineer2', 'testingEngineer3',
      'testingProcedure',
      'testingRequestedBy', 'testingRequestedByName', 'testingTakenBy',
      'testingTakenByName', 'testingCompletedBy', 'testingCompletedByName',
      'testingRequestedAt', 'testingTakenAt', 'testingDate',
      'isDeleted', 'attachedFiles', 'testingFiles',
      'movementHistory', 'shipmentHistory', 'deletionHistory', 'writeOffHistory',
      'reservationHistory', 'addedBy', 'movedBy', 'fromWarehouse', 'toWarehouse',
      'userId', '_v', '__v',
    };
    final list = <Widget>[];
    for (final e in _fullDetails!.entries) {
      if (skip.contains(e.key)) continue;
      final v = e.value;
      if (v == null) continue;
      // Не показуємо складні об'єкти та масиви як текст
      if (v is Map || (v is List && v.isNotEmpty)) continue;
      final display = _formatValue(e.key, v);
      if (display.isEmpty) continue;
      final label = _labelForKey(e.key);
      list.add(_row(label, display));
    }
    return list.isEmpty ? [const Text('—', style: TextStyle(color: Colors.grey))] : list;
  }

  /// Зрозумілі назви полів для користувача (не як у базі).
  String _labelForKey(String key) {
    const map = {
      'standbyPower': 'Резервна потужність',
      'primePower': 'Основна потужність',
      'phase': 'Фази',
      'voltage': 'Напруга',
      'amperage': 'Струм (A)',
      'rpm': 'RPM',
      'dimensions': 'Розміри (мм)',
      'weight': 'Вага (кг)',
      'manufactureDate': 'Дата виробництва',
      'createdAt': 'Створено',
      'updatedAt': 'Оновлено',
      'addedAt': 'Додано',
      'lastModified': 'Змінено',
      'testingRequestedAt': 'Заявка на тестування (дата)',
      'testingTakenAt': 'Взято в тестування',
      'testingDate': 'Дата тестування',
      'uploadedAt': 'Завантажено',
      'reservationEndDate': 'Резерв до',
      'addedByName': 'Додав',
      'isBatch': 'Партія',
      'batchUnit': 'Одиниця',
      'currency': 'Валюта',
      'region': 'Регіон',
    };
    return map[key] ?? key;
  }

  Widget _section(String title, List<Widget> rows) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
        ),
        const SizedBox(height: 8),
        ...rows,
      ],
    );
  }

  Widget _row(String label, String? value) {
    if (value == null || value.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 140,
            child: Text(
              '$label:',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Colors.grey.shade700,
                  ),
            ),
          ),
          Expanded(child: Text(value)),
        ],
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

/// Повноекранна карусель зображень: свайп вліво/вправо, індикатор, масштаб.
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
            final name = items[index].name;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  '${index + 1} / ${items.length}',
                  style: const TextStyle(color: Colors.white70, fontSize: 14),
                ),
                Text(
                  name,
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
