import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../models/employee.dart';
import 'enrollment_screen.dart';

class WorkerSetupScreen extends StatefulWidget {
  const WorkerSetupScreen({super.key});

  @override
  State<WorkerSetupScreen> createState() => _WorkerSetupScreenState();
}

class _WorkerSetupScreenState extends State<WorkerSetupScreen> {
  final _nameController = TextEditingController();
  final _codeController = TextEditingController();
  final _hoursController = TextEditingController(text: '182');
  final _notesController = TextEditingController();
  bool _loading = false;
  String _role = 'general';
  List<Employee> _employees = const [];
  String? _message;
  bool _messageIsError = false;

  @override
  void initState() {
    super.initState();
    _loadEmployees();
  }

  Future<void> _loadEmployees() async {
    setState(() {
      _loading = true;
    });
    try {
      final employees = await ApiClient.instance.fetchEmployees();
      if (!mounted) {
        return;
      }
      setState(() {
        _employees = employees;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _loading = false;
        _message = 'Could not load workers: $error';
        _messageIsError = true;
      });
    }
  }

  Future<void> _submitWorker() async {
    setState(() {
      _loading = true;
      _message = null;
    });
    try {
      final employee = await ApiClient.instance.createEmployee(
        name: _nameController.text.trim(),
        code: _codeController.text.trim(),
        role: _role,
        monthlyTargetHours: double.tryParse(_hoursController.text.trim()) ?? 0,
        notes: _notesController.text.trim(),
      );
      _nameController.clear();
      _codeController.clear();
      _hoursController.text = _rolePresetHours('general').toStringAsFixed(0);
      _notesController.clear();
      _role = 'general';
      await _loadEmployees();
      if (!mounted) {
        return;
      }
      setState(() {
        _message = 'Saved ${employee.name}. Enroll the face next.';
        _messageIsError = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _loading = false;
        _message = 'Could not save worker: $error';
        _messageIsError = true;
      });
    }
  }

  Future<void> _deleteWorker(Employee employee) async {
    setState(() {
      _loading = true;
      _message = null;
    });
    try {
      await ApiClient.instance.deleteEmployee(employee.code);
      await _loadEmployees();
      if (!mounted) {
        return;
      }
      setState(() {
        _message = 'Deleted ${employee.name}.';
        _messageIsError = false;
      });
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _loading = false;
        _message = 'Could not delete worker: $error';
        _messageIsError = true;
      });
    }
  }

  Future<void> _openEnrollment(Employee employee) async {
    final result = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => EnrollmentScreen(employee: employee),
      ),
    );
    if (result == true) {
      await _loadEmployees();
      if (!mounted) {
        return;
      }
      setState(() {
        _message = 'Enrolled face for ${employee.name}.';
        _messageIsError = false;
      });
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _codeController.dispose();
    _hoursController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F1116),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F1116),
        foregroundColor: Colors.white,
        title: const Text('Worker setup'),
        actions: [
          IconButton(
            onPressed: _loading ? null : _loadEmployees,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Add worker',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Save the worker here, then enroll the face from this same screen so scanning uses the native model.',
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _nameController,
                    decoration: const InputDecoration(labelText: 'Worker name'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _codeController,
                    decoration: const InputDecoration(labelText: 'Employee code'),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: _role,
                    items: const [
                      DropdownMenuItem(value: 'general', child: Text('General')),
                      DropdownMenuItem(value: 'driver', child: Text('Driver')),
                      DropdownMenuItem(value: 'admin', child: Text('Admin')),
                    ],
                    onChanged: (value) {
                      if (value == null) {
                        return;
                      }
                      setState(() {
                        _role = value;
                        _hoursController.text =
                            _rolePresetHours(value).toStringAsFixed(0);
                      });
                    },
                    decoration: const InputDecoration(labelText: 'Role'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _hoursController,
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    decoration:
                        const InputDecoration(labelText: 'Monthly target hours'),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _notesController,
                    minLines: 2,
                    maxLines: 4,
                    decoration: const InputDecoration(labelText: 'Notes'),
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: _loading ? null : _submitWorker,
                    child: const Text('Save worker'),
                  ),
                  if (_message != null) ...[
                    const SizedBox(height: 12),
                    Text(
                      _message!,
                      style: TextStyle(
                        color:
                            _messageIsError ? Colors.redAccent : Colors.green,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          if (_loading)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(),
              ),
            )
          else if (_employees.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Text('No workers saved yet.'),
              ),
            )
          else
            ..._employees.map(_buildEmployeeCard),
        ],
      ),
    );
  }

  Widget _buildEmployeeCard(Employee employee) {
    final status = employee.hasNativeFaceProfile
        ? 'Scanner ready'
        : employee.hasLegacyFaceProfile
            ? 'Needs re-enrollment in app'
            : 'No face enrolled';
    final visibleNotes =
        employee.notes.replaceAll('[native-face-v1]', '').trim();
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              employee.name,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
            Text(
              '${employee.code} | ${employee.role} | ${employee.monthlyTargetHours.toStringAsFixed(2)}h',
            ),
            const SizedBox(height: 6),
            Text(status),
            if (visibleNotes.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(visibleNotes),
            ],
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilledButton(
                  onPressed: _loading ? null : () => _openEnrollment(employee),
                  child: Text(
                    employee.hasNativeFaceProfile
                        ? 'Re-enroll face'
                        : 'Enroll face',
                  ),
                ),
                OutlinedButton(
                  onPressed: _loading ? null : () => _deleteWorker(employee),
                  child: const Text('Delete'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  double _rolePresetHours(String role) {
    switch (role) {
      case 'driver':
        return 210;
      case 'admin':
        return 176;
      default:
        return 182;
    }
  }
}
