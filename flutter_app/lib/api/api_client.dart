import 'package:dio/dio.dart';

import '../config.dart';
import '../models/employee.dart';

class ScanRecordResult {
  const ScanRecordResult({
    required this.type,
    required this.employeeName,
    required this.timestamp,
  });

  final String type;
  final String employeeName;
  final DateTime timestamp;
}

class ApiClient {
  ApiClient._();

  static final ApiClient instance = ApiClient._();

  final Dio _dio = Dio(
    BaseOptions(
      baseUrl: defaultApiBaseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 15),
    ),
  );

  Future<List<Employee>> fetchEmployees() async {
    final response = await _dio.get<List<dynamic>>('/api/employees');
    final data = response.data ?? const [];
    return data
        .map((row) => Employee.fromJson(Map<String, dynamic>.from(row as Map)))
        .toList();
  }

  Future<Employee> saveEmployee(Employee employee,
      {List<double>? faceDescriptorOverride}) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/api/employees',
        data: employee.toUpsertJson(
          faceDescriptorOverride: faceDescriptorOverride,
        ),
      );
      return Employee.fromJson(
        Map<String, dynamic>.from(response.data ?? const {}),
      );
    } on DioException catch (error) {
      final payload = error.response?.data;
      final message = payload is Map && payload['error'] != null
          ? payload['error'].toString()
          : error.message ?? 'Request failed.';
      throw Exception(message);
    }
  }

  Future<Employee> createEmployee({
    required String name,
    required String code,
    required String role,
    required double monthlyTargetHours,
    required String notes,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/api/employees',
        data: {
          'name': name,
          'code': code,
          'role': role,
          'monthlyTargetHours': monthlyTargetHours,
          'notes': notes,
        },
      );
      return Employee.fromJson(
        Map<String, dynamic>.from(response.data ?? const {}),
      );
    } on DioException catch (error) {
      final payload = error.response?.data;
      final message = payload is Map && payload['error'] != null
          ? payload['error'].toString()
          : error.message ?? 'Request failed.';
      throw Exception(message);
    }
  }

  Future<void> deleteEmployee(String code) async {
    try {
      await _dio.delete<void>('/api/employees/$code');
    } on DioException catch (error) {
      final payload = error.response?.data;
      final message = payload is Map && payload['error'] != null
          ? payload['error'].toString()
          : error.message ?? 'Delete failed.';
      throw Exception(message);
    }
  }

  Future<ScanRecordResult> recordScan(String employeeCode) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(
        '/api/scans',
        data: {'employeeCode': employeeCode},
      );
      final data = Map<String, dynamic>.from(response.data ?? const {});
      final scan = Map<String, dynamic>.from(data['scan'] as Map? ?? const {});
      return ScanRecordResult(
        type: (scan['type'] ?? '').toString(),
        employeeName: (scan['employeeName'] ?? '').toString(),
        timestamp: DateTime.tryParse((scan['timestamp'] ?? '').toString()) ??
            DateTime.now(),
      );
    } on DioException catch (error) {
      final payload = error.response?.data;
      final message = payload is Map && payload['error'] != null
          ? payload['error'].toString()
          : error.message ?? 'Scan save failed.';
      throw Exception(message);
    }
  }
}
