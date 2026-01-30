import 'dart:convert';

import 'secure_storage.dart';

class DraftService {
  DraftService._internal();

  static final DraftService instance = DraftService._internal();

  static const _operatorDraftKey = 'operator_task_draft';

  Future<void> saveOperatorDraft(Map<String, dynamic> data) async {
    await SecureStorage.writeString(
      _operatorDraftKey,
      jsonEncode(data),
    );
  }

  Future<Map<String, dynamic>?> loadOperatorDraft() async {
    final raw = await SecureStorage.readString(_operatorDraftKey);
    if (raw == null) return null;
    final decoded = jsonDecode(raw);
    if (decoded is Map<String, dynamic>) {
      return decoded;
    }
    return null;
  }

  Future<void> clearOperatorDraft() async {
    await SecureStorage.deleteKey(_operatorDraftKey);
  }
}
