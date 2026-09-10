import 'package:flutter/material.dart';

import '../../core/services/auth_service.dart';
import '../../core/services/push_notification_service.dart';
import '../../core/services/push_tap_handler.dart';
import '../home/home_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  static const routeName = '/login';

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _loginController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isLoading = false;
  bool _obscurePassword = true;
  String? _errorMessage;
  String? _pendingTaskHint;

  @override
  void initState() {
    super.initState();
    _restoreSaved();
  }

  Future<void> _restoreSaved() async {
    final creds = await AuthService.instance.readSavedCredentials();
    final pending = await PushNotificationService.instance.peekPending();
    if (!mounted) return;
    if (creds != null) {
      _loginController.text = creds.login;
      _passwordController.text = creds.password;
    }
    final number = pending?['taskNumber']?.toString();
    setState(() {
      if (number != null && number.isNotEmpty) {
        _pendingTaskHint = 'Увійдіть, щоб відкрити заявку $number';
      } else if (pending?['taskId']?.toString().isNotEmpty == true) {
        _pendingTaskHint = 'Увійдіть, щоб відкрити заявку з повідомлення';
      }
    });
  }

  @override
  void dispose() {
    _loginController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) {
      return;
    }
    _login();
  }

  Future<void> _login() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      await AuthService.instance.login(
        login: _loginController.text.trim(),
        password: _passwordController.text.trim(),
      );
      if (!mounted) return;
      final pending = await PushNotificationService.instance.peekPending();
      if (!mounted) return;
      if (pending != null && (pending['taskId']?.toString().isNotEmpty ?? false)) {
        await openTaskFromPushData(pending);
        return;
      }
      Navigator.of(context).pushReplacementNamed(HomeScreen.routeName);
    } catch (error) {
      setState(() {
        _errorMessage = AuthService.parseError(error);
      });
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: AutofillGroup(
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 24),
                  Text(
                    'DTS Mobile',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 24),
                  if (_pendingTaskHint != null) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.primaryContainer,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        _pendingTaskHint!,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.onPrimaryContainer,
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],
                  if (_errorMessage != null) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.red.shade50,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.red.shade200),
                      ),
                      child: Text(
                        _errorMessage!,
                        style: TextStyle(color: Colors.red.shade700),
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],
                  TextFormField(
                    controller: _loginController,
                    textInputAction: TextInputAction.next,
                    autofillHints: const [AutofillHints.username],
                    decoration: const InputDecoration(
                      labelText: 'Логін',
                      border: OutlineInputBorder(),
                    ),
                    validator: (value) {
                      if (value == null || value.trim().isEmpty) {
                        return 'Введіть логін';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _passwordController,
                    obscureText: _obscurePassword,
                    textInputAction: TextInputAction.done,
                    onFieldSubmitted: (_) => _submit(),
                    autofillHints: const [AutofillHints.password],
                    decoration: InputDecoration(
                      labelText: 'Пароль',
                      border: const OutlineInputBorder(),
                      suffixIcon: IconButton(
                        onPressed: () {
                          setState(() => _obscurePassword = !_obscurePassword);
                        },
                        icon: Icon(
                          _obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                        ),
                      ),
                    ),
                    validator: (value) {
                      if (value == null || value.trim().isEmpty) {
                        return 'Введіть пароль';
                      }
                      return null;
                    },
                  ),
                  const Spacer(),
                  ElevatedButton(
                    onPressed: _isLoading ? null : _submit,
                    child: _isLoading
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Увійти'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
