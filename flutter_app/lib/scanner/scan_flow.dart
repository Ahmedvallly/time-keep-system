import 'dart:async';
import 'dart:math' show Point;
import 'dart:ui';

import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';

import '../api/api_client.dart';
import '../config.dart';
import '../models/employee.dart';
import '../recognition/embedder.dart';
import '../recognition/liveness.dart';
import '../recognition/matcher.dart';
import '../util/feedback.dart';

enum ScanPhase {
  init,
  idle,
  faceDetected,
  scanning,
  checkIn,
  checkOut,
  unknown,
  ambiguous,
  multipleFaces,
  faceTooFar,
  poorLighting,
  livenessFailed,
  backendFailure,
}

class ScanOutcome {
  const ScanOutcome({
    required this.phase,
    this.employeeCode,
    this.employeeName,
    this.at,
    this.message,
    this.score,
  });

  final ScanPhase phase;
  final String? employeeCode;
  final String? employeeName;
  final DateTime? at;
  final String? message;
  final double? score;
}

class ScanFlowController extends ChangeNotifier {
  ScanFlowController(this.cameras);

  final List<CameraDescription> cameras;
  CameraController? _camera;
  FaceDetector? _detector;
  FaceEmbedder? _embedder;
  Timer? _cooldownTimer;
  bool _disposed = false;
  bool _busy = false;
  bool _presenceLock = false;
  List<Employee> _employees = const [];
  List<TemplateCandidate> _templates = const [];

  ScanPhase phase = ScanPhase.init;
  ScanOutcome? outcome;
  double? lastConfidence;
  String? initError;
  CameraDescription? selectedCamera;
  final LivenessTracker _liveness = LivenessTracker();
  final List<List<double>> _samples = [];
  ValueChanged<String>? onAnnouncement;

  CameraController? get camera => _camera;
  int get templateCount => _templates.length;
  int get workerCount => _employees.length;
  bool get hasTemplates => _templates.isNotEmpty;
  List<Employee> get employees => List<Employee>.unmodifiable(_employees);

  Future<void> init() async {
    try {
      _embedder = FaceEmbedder();
      await _embedder!.init();
      if (!_embedder!.ready) {
        initError = _embedder!.error;
        notifyListeners();
        return;
      }
      _detector = FaceDetector(
        options: FaceDetectorOptions(
          performanceMode: FaceDetectorMode.accurate,
          enableLandmarks: true,
          enableClassification: true,
        ),
      );
      await refreshEmployees();
      await _openCamera();
      phase = _templates.isEmpty ? ScanPhase.idle : ScanPhase.idle;
      notifyListeners();
    } catch (error) {
      initError = 'Scanner init failed: $error';
      notifyListeners();
    }
  }

  Future<void> refreshEmployees() async {
    _employees = await ApiClient.instance.fetchEmployees();
    _templates = _employees
        .where((employee) => employee.hasAnyFaceProfile)
        .map(
          (employee) => TemplateCandidate(
            employee.code,
            employee.name,
            compactEmbedding(employee.faceDescriptor),
          ),
        )
        .toList();
    notifyListeners();
  }

  Future<void> _openCamera() async {
    final ordered = [
      ...cameras
          .where((camera) => camera.lensDirection == CameraLensDirection.front),
      ...cameras
          .where((camera) => camera.lensDirection != CameraLensDirection.front),
    ];

    for (final candidate in ordered) {
      final controller = CameraController(
        candidate,
        kCameraResolution,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.nv21,
      );
      try {
        await controller.initialize();
        selectedCamera = candidate;
        _camera = controller;
        await controller.setFlashMode(FlashMode.off);
        await controller.startImageStream(_onFrame);
        return;
      } catch (_) {
        await controller.dispose();
      }
    }
    throw Exception('No usable camera found.');
  }

  Future<void> _onFrame(CameraImage image) async {
    if (_disposed || _busy) {
      return;
    }
    final detector = _detector;
    final embedder = _embedder;
    final camera = _camera;
    if (detector == null ||
        embedder == null ||
        camera == null ||
        selectedCamera == null) {
      return;
    }

    _busy = true;
    try {
      final rotationDeg = selectedCamera!.sensorOrientation % 360;
      final inputImage = InputImage.fromBytes(
        bytes: nv21Of(image),
        metadata: InputImageMetadata(
          size: Size(image.width.toDouble(), image.height.toDouble()),
          rotation: InputImageRotation.values[rotationDeg ~/ 90],
          format: InputImageFormat.nv21,
          bytesPerRow: 0,
        ),
      );
      final faces = await detector
          .processImage(inputImage)
          .timeout(const Duration(seconds: 4));

      if (faces.isEmpty) {
        if (_presenceLock) {
          _presenceLock = false;
          _resetScan();
          phase = ScanPhase.idle;
          notifyListeners();
        }
        return;
      }

      if (faces.length > 1) {
        _resetScan();
        phase = ScanPhase.multipleFaces;
        notifyListeners();
        return;
      }

      if (_presenceLock) {
        return;
      }

      final face = faces.first;
      final upright = yuvToUprightRgba(image, rotationDeg, mirrorX: false);
      final meanLuma = _meanLuma(upright.bytes, upright.width, upright.height);
      final issue = ScanQuality.check(
        faceWidthPx: face.boundingBox.width.round(),
        frameWidthPx: upright.width,
        meanLuma: meanLuma,
      );

      switch (issue) {
        case QualityIssue.tooFar:
          _resetScan();
          phase = ScanPhase.faceTooFar;
          notifyListeners();
          return;
        case QualityIssue.poorLighting:
          _resetScan();
          phase = ScanPhase.poorLighting;
          notifyListeners();
          return;
        case QualityIssue.multipleFaces:
          _resetScan();
          phase = ScanPhase.multipleFaces;
          notifyListeners();
          return;
        case QualityIssue.none:
          break;
      }

      if (_templates.isEmpty) {
        phase = ScanPhase.unknown;
        outcome = const ScanOutcome(
          phase: ScanPhase.unknown,
          message: 'No enrolled worker faces yet.',
        );
        notifyListeners();
        _scheduleCooldown();
        return;
      }

      if (phase != ScanPhase.scanning) {
        phase = ScanPhase.scanning;
        notifyListeners();
        await FeedbackFx.scanCapture();
      }

      final sharpness = ImageSharpness.faceRegionSharpness(
        upright.bytes,
        upright.width,
        upright.height,
        face.boundingBox.left.round(),
        face.boundingBox.top.round(),
        face.boundingBox.width.round(),
        face.boundingBox.height.round(),
      );
      if (!ImageSharpness.acceptable(sharpness)) {
        return;
      }

      final landmarks = _landmarkOffsets(face, face.boundingBox);
      if (landmarks.length != 5) {
        return;
      }

      _liveness.observe(
        leftOpen: face.leftEyeOpenProbability ?? 0.5,
        rightOpen: face.rightEyeOpenProbability ?? 0.5,
      );

      final embedding = embedder.embed(
        rgba: upright.bytes,
        width: upright.width,
        height: upright.height,
        landmarks: landmarks,
      );
      if (embedding == null) {
        return;
      }
      _samples.add(compactEmbedding(embedding));
      lastConfidence = _progressiveScore(_samples);

      if (_samples.length >= kMinSamples &&
          (_liveness.isSatisfied || lastConfidence != null && lastConfidence! >= kAcceptThreshold)) {
        await _finishScan();
      } else if (_samples.length >= kMaxSamples) {
        if (lastConfidence != null && lastConfidence! >= kAcceptThreshold) {
          await _finishScan();
        } else {
          phase = ScanPhase.livenessFailed;
          outcome = const ScanOutcome(
            phase: ScanPhase.livenessFailed,
            message: 'Hold still, move closer, and try again.',
          );
          notifyListeners();
          await FeedbackFx.error();
          _scheduleCooldown();
        }
      }
    } catch (error) {
      debugPrint('scan frame error: $error');
    } finally {
      _busy = false;
    }
  }

  double _progressiveScore(List<List<double>> samples) {
    if (samples.length < 2) {
      return 0.0;
    }
    final fused = fuseEmbeddings(samples);
    var best = 0.0;
    for (final candidate in _templates) {
      final score = cosineSimilarity(fused, candidate.embedding);
      if (score > best) {
        best = score;
      }
    }
    return best;
  }

  Future<void> _finishScan() async {
    final fused = robustFuse(_samples);
    final match = matchEmbedding(fused, _templates);
    if (!match.matched) {
      outcome = ScanOutcome(
        phase: match.ambiguous ? ScanPhase.ambiguous : ScanPhase.unknown,
        employeeCode: match.employeeCode,
        employeeName: match.employeeName,
        score: match.score,
        message: match.ambiguous
            ? 'Unclear match. Ask the worker to try again.'
            : 'Face not recognized. Enroll the worker again.',
      );
      phase = outcome!.phase;
      notifyListeners();
      await FeedbackFx.error();
      _scheduleCooldown();
      return;
    }

    try {
      final result = await ApiClient.instance.recordScan(match.employeeCode!);
      final nextPhase =
          result.type == 'clock_in' ? ScanPhase.checkIn : ScanPhase.checkOut;
      outcome = ScanOutcome(
        phase: nextPhase,
        employeeCode: match.employeeCode,
        employeeName: result.employeeName,
        at: result.timestamp,
        score: match.score,
      );
      phase = nextPhase;
      notifyListeners();
      await FeedbackFx.success();
      final prefix = nextPhase == ScanPhase.checkIn ? 'Welcome' : 'Goodbye';
      onAnnouncement?.call('$prefix ${result.employeeName}');
    } catch (error) {
      outcome = ScanOutcome(
        phase: ScanPhase.backendFailure,
        employeeCode: match.employeeCode,
        employeeName: match.employeeName,
        score: match.score,
        message: 'Could not save the scan: $error',
      );
      phase = ScanPhase.backendFailure;
      notifyListeners();
      await FeedbackFx.error();
    }
    _scheduleCooldown();
  }

  List<Offset> _landmarkOffsets(Face face, Rect box) {
    final landmarks = face.landmarks;
    Point<int>? get(FaceLandmarkType type) => landmarks[type]?.position;
    final leftEye = get(FaceLandmarkType.leftEye);
    final rightEye = get(FaceLandmarkType.rightEye);
    final nose = get(FaceLandmarkType.noseBase);
    final leftMouth = get(FaceLandmarkType.leftMouth);
    final rightMouth = get(FaceLandmarkType.rightMouth);
    if (leftEye != null &&
        rightEye != null &&
        nose != null &&
        leftMouth != null &&
        rightMouth != null) {
      return [
        Offset(leftEye.x.toDouble(), leftEye.y.toDouble()),
        Offset(rightEye.x.toDouble(), rightEye.y.toDouble()),
        Offset(nose.x.toDouble(), nose.y.toDouble()),
        Offset(leftMouth.x.toDouble(), leftMouth.y.toDouble()),
        Offset(rightMouth.x.toDouble(), rightMouth.y.toDouble()),
      ];
    }

    final x = box.left.toDouble();
    final y = box.top.toDouble();
    final width = box.width.toDouble();
    final height = box.height.toDouble();
    return [
      Offset(x + 0.33 * width, y + 0.30 * height),
      Offset(x + 0.67 * width, y + 0.30 * height),
      Offset(x + 0.50 * width, y + 0.50 * height),
      Offset(x + 0.38 * width, y + 0.72 * height),
      Offset(x + 0.62 * width, y + 0.72 * height),
    ];
  }

  double _meanLuma(Uint8List rgba, int width, int height) {
    const step = 16;
    var sum = 0.0;
    var count = 0;
    for (var y = 0; y < height; y += step) {
      for (var x = 0; x < width; x += step) {
        sum += rgba[(y * width + x) * 4];
        count += 1;
      }
    }
    return count == 0 ? 128 : sum / count;
  }

  void _resetScan() {
    _samples.clear();
  }

  void _scheduleCooldown() {
    _presenceLock = true;
    _cooldownTimer?.cancel();
    _cooldownTimer = Timer(
      const Duration(milliseconds: kResultHoldMs + kScanCooldownMs),
      () {
        _resetScan();
        outcome = null;
        phase = ScanPhase.idle;
        notifyListeners();
      },
    );
  }

  Future<void> pause() async {
    _cooldownTimer?.cancel();
    if (_camera != null && _camera!.value.isStreamingImages) {
      await _camera!.stopImageStream();
    }
  }

  Future<void> resume() async {
    if (_camera != null && !_camera!.value.isStreamingImages) {
      await _camera!.startImageStream(_onFrame);
    }
    phase = ScanPhase.idle;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _cooldownTimer?.cancel();
    _camera?.stopImageStream();
    _camera?.dispose();
    _detector?.close();
    super.dispose();
  }
}
