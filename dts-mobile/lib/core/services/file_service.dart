import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';

import 'api_client.dart';

class FileService {
  FileService._internal();

  static final FileService instance = FileService._internal();

  Future<void> uploadTaskFiles({
    required String taskId,
    required List<XFile> files,
    String? description,
  }) async {
    final formData = FormData();
    for (final file in files) {
      formData.files.add(
        MapEntry(
          'files',
          await MultipartFile.fromFile(file.path, filename: file.name),
        ),
      );
    }
    if (description != null && description.isNotEmpty) {
      formData.fields.add(MapEntry('description', description));
    }

    await ApiClient.instance.dio.post(
      '/api/files/upload/$taskId',
      data: formData,
      options: Options(contentType: 'multipart/form-data'),
    );
  }

  Future<void> uploadTestingFiles({
    required String equipmentId,
    required List<XFile> files,
  }) async {
    final formData = FormData();
    for (final file in files) {
      formData.files.add(
        MapEntry(
          'files',
          await MultipartFile.fromFile(file.path, filename: file.name),
        ),
      );
    }
    await ApiClient.instance.dio.post(
      '/api/equipment/$equipmentId/testing-files',
      data: formData,
      options: Options(contentType: 'multipart/form-data'),
    );
  }

  Future<List<Map<String, dynamic>>> fetchTaskFiles(String taskId) async {
    final response =
        await ApiClient.instance.dio.get('/api/files/task/$taskId');
    final data = response.data;
    if (data is List) {
      return data.whereType<Map<String, dynamic>>().toList();
    }
    return [];
  }
}
