import 'dart:async';
import 'dart:math' show Point;
import 'dart:typed_data';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';
import 'package:permission_handler/permission_handler.dart';

import '../api/api_client.dart';
import '../config.dart';
import '../models/employee.dart';
import '../recognition/embedder.dart';
import '../recognition/liveness.dart';
import '../recognition/matcher.dart';
import '../util/feedback.dart';

enum _CaptureState { ready, busy, done, error }

class EnrollmentScreen extends StatefulWidget {
  const EnrollmentScreen({super.key, required this.employee});

  final Employee employee;

  @override
  State<EnrollmentScreen> createState() => _EnrollmentScreenState();
}

class _EnrollmentScreenState extends State<EnrollmentScreen> {
  CameraController? _camera;
  FaceDetector? _detector;
  FaceEmbedder? _embedder;
  bool _busy = false;
  _CaptureState _state = _CaptureState.ready;
  String? _error;
  final List<List<double>> _samples = [];
  final List<double> _yaws = [];
  int _captured = 0;
  String _hint = 'Center your face in the frame';
  int _rejected = 0;
  int _frame = 0;
  String _diag = '';

  static const int _targetSamples = 4;

  @override
  void initState() {
    super.initState();
    unawaited(_init());
  }

  Future<void> _init() async {
    try {
      final cameraPermission = await Permission.camera.request();
      if (!cameraPermission.isGranted) {
        throw Exception('Camera permission is required for face enrollment.');
      }
      _embedder = FaceEmbedder();
      await _embedder!.init();
      if (!_embedder!.ready) {
        throw Exception(_embedder!.error ?? 'Face model could not start.');
      }
      _detector = FaceDetector(
        options: FaceDetectorOptions(
          performanceMode: FaceDetectorMode.accurate,
          enableLandmarks: true,
          enableClassification: true,
        ),
      );
      final cameras = await availableCameras();
      final ordered = [
        ...cameras.where(
            (camera) => camera.lensDirection == CameraLensDirection.front),
        ...cameras.where(
            (camera) => camera.lensDirection != CameraLensDirection.front),
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
          _camera = controller;
          await controller.startImageStream(_onFrame);
          if (mounted) {
            setState(() {});
          }
          return;
        } catch (_) {
          await controller.dispose();
        }
      }
      throw Exception('No usable camera found.');
    } catch (error) {
      if (mounted) {
        setState(() {
          _state = _CaptureState.error;
          _error = 'Init failed: $error';
        });
      }
    }
  }

  Future<void> _onFrame(CameraImage image) async {
    if (_busy || _captured >= _targetSamples || _state != _CaptureState.ready) {
      return;
    }
    final detector = _detector;
    final embedder = _embedder;
    final camera = _camera;
    if (detector == null || embedder == null || camera == null) {
      return;
    }

    _busy = true;
    try {
      final rotationDeg = camera.description.sensorOrientation % 360;
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
      _frame += 1;
      final upright = yuvToUprightRgba(image, rotationDeg, mirrorX: false);

      if (faces.isEmpty) {
        _setHint('Center your face in the frame');
        _updateDiag(faces: 0, landmarks: 0);
        return;
      }
      if (faces.length > 1) {
        _setHint('Only one person in frame');
        _updateDiag(
            faces: faces.length, landmarks: faces.first.landmarks.length);
        return;
      }

      final face = faces.first;
      final ratio = face.boundingBox.width / upright.width;
      final luma = _meanLuma(upright.bytes, upright.width, upright.height);
      final yaw = face.headEulerAngleY ?? 0;
      _updateDiag(
        faces: faces.length,
        landmarks: face.landmarks.length,
        ratio: ratio,
        luma: luma.round(),
        yaw: yaw,
      );

      if (!EnrollmentQuality.acceptable(
        faceWidthRatio: ratio,
        meanLuma: luma,
        yaw: yaw,
      )) {
        _rejected += 1;
        if (ratio < 0.18) {
          _setHint('Move closer');
        } else if (luma < 30) {
          _setHint('Better lighting needed');
        } else {
          _setHint('Face the camera directly');
        }
        return;
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
      if (!ImageSharpness.acceptable(sharpness, minScore: 90)) {
        _rejected += 1;
        _setHint('Hold still for a sharp frame');
        return;
      }

      final landmarks = _landmarks(face, face.boundingBox);
      final embedding = embedder.embed(
        rgba: upright.bytes,
        width: upright.width,
        height: upright.height,
        landmarks: landmarks,
      );
      if (embedding == null) {
        return;
      }

      _samples.add(embedding);
      _yaws.add(yaw);
      _captured += 1;
      await FeedbackFx.scanCapture();
      if (mounted) {
        setState(() {});
      }
      if (_captured >= _targetSamples) {
        await _finish();
      } else {
        _setHint('Keep still - $_captured/$_targetSamples');
      }
    } catch (error) {
      _frame += 1;
      if (_frame % 5 == 0) {
        _setDiagOnly('err: $error');
      }
    } finally {
      _busy = false;
    }
  }

  Future<void> _finish() async {
    if (_samples.length < 2) {
      _setHint('Keep your face centered for a little longer');
      return;
    }

    final yawSpread = _yaws.isEmpty
        ? 0.0
        : _yaws.reduce((a, b) => a > b ? a : b) -
            _yaws.reduce((a, b) => a < b ? a : b);
    if (yawSpread < 3.0 && _samples.length < 3) {
      _setHint('Turn your head slightly left and right');
      return;
    }

    setState(() => _state = _CaptureState.busy);
    final fused = compactEmbedding(robustFuse(_samples));
    try {
      await ApiClient.instance.saveEmployee(
        widget.employee
            .copyWith(notes: widget.employee.notesWithNativeFaceMarker),
        faceDescriptorOverride: fused,
      );
      if (mounted) {
        setState(() => _state = _CaptureState.done);
      }
      await FeedbackFx.success();
    } catch (error) {
      if (mounted) {
        setState(() {
          _state = _CaptureState.error;
          _error = 'Enrollment failed: $error';
        });
      }
    }
  }

  List<Offset> _landmarks(Face face, Rect box) {
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

  double _meanLuma(Uint8List bgra, int width, int height) {
    const step = 16;
    var sum = 0.0;
    var count = 0;
    for (var y = 0; y < height; y += step) {
      for (var x = 0; x < width; x += step) {
        sum += bgra[(y * width + x) * 4 + 2];
        count += 1;
      }
    }
    return count == 0 ? 128 : sum / count;
  }

  void _setHint(String hint) {
    if (mounted && _hint != hint) {
      setState(() => _hint = hint);
    }
  }

  void _setDiagOnly(String text) {
    if (mounted && _diag != text) {
      setState(() => _diag = text);
    }
  }

  void _updateDiag({
    required int faces,
    required int landmarks,
    double? ratio,
    int? luma,
    double? yaw,
  }) {
    if (_frame % 3 != 0) {
      return;
    }
    final ratioText = ratio == null ? '' : 'w:${(ratio * 100).round()}%';
    final lumaText = luma == null ? '' : ' luma:$luma';
    final yawText = yaw == null ? '' : ' yaw:${yaw.round()}deg';
    final text =
        'F:$faces L:$landmarks $ratioText$lumaText$yawText cap:$_captured/$_targetSamples rej:$_rejected';
    if (mounted && _diag != text) {
      setState(() => _diag = text);
    }
  }

  @override
  void dispose() {
    _camera?.stopImageStream();
    _camera?.dispose();
    _detector?.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B0D10),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0E1116),
        foregroundColor: Colors.white,
        title: Text('Enroll ${widget.employee.name}'),
      ),
      body: Stack(
        fit: StackFit.expand,
        children: [
          if (_camera != null && _camera!.value.isInitialized)
            CameraPreview(_camera!)
          else
            const Center(
                child: CircularProgressIndicator(color: Colors.white24)),
          if (_state == _CaptureState.done)
            _overlay(
              const Icon(Icons.check_circle_rounded,
                  color: Color(0xFF2FBF71), size: 64),
              'Face enrolled',
              'This worker can now scan in and out with the native scanner.',
            )
          else if (_state == _CaptureState.error)
            _overlay(
              const Icon(Icons.error_outline_rounded,
                  color: Color(0xFFFF5D5D), size: 64),
              'Enrollment failed',
              _error ?? 'Please try again.',
            )
          else
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Container(
                padding: const EdgeInsets.fromLTRB(24, 18, 24, 30),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Colors.transparent, Color(0xE60B0D10)],
                    stops: [0.0, 0.6],
                  ),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      _hint,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w500),
                    ),
                    if (_diag.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        _diag,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Colors.white30,
                          fontSize: 11,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ],
                    const SizedBox(height: 12),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        for (var i = 0; i < _targetSamples; i++)
                          Container(
                            width: 14,
                            height: 14,
                            margin: const EdgeInsets.symmetric(horizontal: 4),
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: i < _captured
                                  ? const Color(0xFF2FBF71)
                                  : Colors.white24,
                            ),
                          ),
                      ],
                    ),
                    if (_captured >= 2) ...[
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed: _state == _CaptureState.ready
                            ? () => unawaited(_finish())
                            : null,
                        child: const Text('Save current face'),
                      ),
                    ],
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _overlay(Widget icon, String title, String subtitle) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          icon,
          const SizedBox(height: 12),
          Text(
            title,
            style: const TextStyle(
                color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 6),
          Text(
            subtitle,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white54, fontSize: 14),
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: () =>
                Navigator.of(context).pop(_state == _CaptureState.done),
            child: Text(_state == _CaptureState.done ? 'Done' : 'Close'),
          ),
        ],
      ),
    );
  }
}
