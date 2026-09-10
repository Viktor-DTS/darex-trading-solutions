import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';

class ConnectivityService extends ChangeNotifier {
  ConnectivityService._internal();

  static final ConnectivityService instance = ConnectivityService._internal();

  final Connectivity _connectivity = Connectivity();
  StreamSubscription<List<ConnectivityResult>>? _sub;
  bool _online = true;

  bool get isOnline => _online;
  bool get isOffline => !_online;

  Future<void> init() async {
    final current = await _connectivity.checkConnectivity();
    _setOnline(_hasNetwork(current));
    await _sub?.cancel();
    _sub = _connectivity.onConnectivityChanged.listen((results) {
      _setOnline(_hasNetwork(results));
    });
  }

  bool _hasNetwork(List<ConnectivityResult> results) {
    return results.any((r) => r != ConnectivityResult.none);
  }

  void _setOnline(bool value) {
    if (_online == value) return;
    _online = value;
    notifyListeners();
  }

  Future<void> disposeService() async {
    await _sub?.cancel();
    _sub = null;
  }
}
