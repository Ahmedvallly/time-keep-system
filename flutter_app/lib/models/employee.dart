const String nativeFaceMarker = '[native-face-v1]';

class Employee {
  const Employee({
    required this.id,
    required this.code,
    required this.name,
    required this.role,
    required this.monthlyTargetHours,
    required this.notes,
    required this.faceDescriptor,
    required this.faceUpdatedAt,
  });

  final String id;
  final String code;
  final String name;
  final String role;
  final double monthlyTargetHours;
  final String notes;
  final List<double> faceDescriptor;
  final String faceUpdatedAt;

  bool get hasNativeFaceProfile =>
      faceDescriptor.isNotEmpty && notes.contains(nativeFaceMarker);
  bool get hasLegacyFaceProfile =>
      faceDescriptor.length == 128 && !notes.contains(nativeFaceMarker);
  bool get hasAnyFaceProfile => hasNativeFaceProfile;

  String get notesWithNativeFaceMarker {
    if (notes.contains(nativeFaceMarker)) {
      return notes;
    }
    return notes.isEmpty ? nativeFaceMarker : '$notes\n$nativeFaceMarker';
  }

  factory Employee.fromJson(Map<String, dynamic> json) {
    final rawDescriptor = json['faceDescriptor'];
    return Employee(
      id: (json['id'] ?? '').toString(),
      code: (json['code'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      role: (json['role'] ?? 'general').toString(),
      monthlyTargetHours: (json['monthlyTargetHours'] as num?)?.toDouble() ?? 0,
      notes: (json['notes'] ?? '').toString(),
      faceDescriptor: rawDescriptor is List
          ? rawDescriptor.map((value) => (value as num).toDouble()).toList()
          : const [],
      faceUpdatedAt: (json['faceUpdatedAt'] ?? '').toString(),
    );
  }

  Map<String, dynamic> toUpsertJson({
    List<double>? faceDescriptorOverride,
  }) {
    return {
      'name': name,
      'code': code,
      'role': role,
      'monthlyTargetHours': monthlyTargetHours,
      'notes': notes,
      'faceDescriptor': faceDescriptorOverride ?? faceDescriptor,
    };
  }

  Employee copyWith({
    String? id,
    String? code,
    String? name,
    String? role,
    double? monthlyTargetHours,
    String? notes,
    List<double>? faceDescriptor,
    String? faceUpdatedAt,
  }) {
    return Employee(
      id: id ?? this.id,
      code: code ?? this.code,
      name: name ?? this.name,
      role: role ?? this.role,
      monthlyTargetHours: monthlyTargetHours ?? this.monthlyTargetHours,
      notes: notes ?? this.notes,
      faceDescriptor: faceDescriptor ?? this.faceDescriptor,
      faceUpdatedAt: faceUpdatedAt ?? this.faceUpdatedAt,
    );
  }
}
