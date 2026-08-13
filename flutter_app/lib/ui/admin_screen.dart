import 'package:flutter/material.dart';

import 'admin_dashboard_screen.dart';
import 'worker_setup_screen.dart';

class AdminScreen extends StatefulWidget {
  const AdminScreen({super.key, required this.onClose});

  final VoidCallback onClose;

  @override
  State<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends State<AdminScreen> {
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _authenticated = false;
  String? _message;
  bool _messageIsError = false;

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F1116),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F1116),
        foregroundColor: Colors.white,
        title: const Text('Admin'),
        leading: IconButton(
          onPressed: widget.onClose,
          icon: const Icon(Icons.arrow_back),
        ),
      ),
      body: _authenticated ? _buildMenu(context) : _buildLogin(),
    );
  }

  Widget _buildLogin() {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: _usernameController,
                decoration: const InputDecoration(labelText: 'Username'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _passwordController,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Password'),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () {
                  if (_usernameController.text.trim() == 'a' &&
                      _passwordController.text == 'a') {
                    setState(() {
                      _authenticated = true;
                      _message = null;
                    });
                  } else {
                    setState(() {
                      _message = 'Incorrect username or password.';
                      _messageIsError = true;
                    });
                  }
                },
                child: const Text('Open admin'),
              ),
              if (_message != null) ...[
                const SizedBox(height: 12),
                Text(
                  _message!,
                  style: TextStyle(
                    color:
                        _messageIsError ? Colors.redAccent : Colors.greenAccent,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMenu(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const Text(
          'Admin tools',
          style: TextStyle(
            color: Colors.white,
            fontSize: 24,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'Use worker setup here for adding users and enrolling faces. Use the dashboard for times, leave, holidays, and reports.',
          style: TextStyle(color: Colors.white70),
        ),
        const SizedBox(height: 20),
        FilledButton.icon(
          onPressed: () {
            Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const WorkerSetupScreen()),
            );
          },
          icon: const Icon(Icons.badge_outlined),
          label: const Text('Worker setup'),
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: () {
            Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const AdminDashboardScreen()),
            );
          },
          icon: const Icon(Icons.dashboard_outlined),
          label: const Text('Open full dashboard'),
        ),
      ],
    );
  }
}
