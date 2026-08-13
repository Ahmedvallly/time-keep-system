import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';

import 'scanner/scan_flow.dart';
import 'ui/admin_screen.dart';
import 'ui/scanner_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  final cameras = await availableCameras();
  runApp(TimeKeepNativeApp(cameras: cameras));
}

class TimeKeepNativeApp extends StatefulWidget {
  const TimeKeepNativeApp({super.key, required this.cameras});

  final List<CameraDescription> cameras;

  @override
  State<TimeKeepNativeApp> createState() => _TimeKeepNativeAppState();
}

class _TimeKeepNativeAppState extends State<TimeKeepNativeApp> {
  static const MethodChannel _ttsChannel = MethodChannel(
    'com.timekeepsystem.mobile/tts',
  );

  late final ScanFlowController _scanner;
  String? _startupError;
  bool _adminOpen = false;

  @override
  void initState() {
    super.initState();
    _scanner = ScanFlowController(widget.cameras);
    _scanner.onAnnouncement = _speak;
    unawaited(_bootstrap());
  }

  Future<void> _bootstrap() async {
    try {
      final cameraPermission = await Permission.camera.request();
      if (!cameraPermission.isGranted) {
        throw Exception('Camera permission was denied.');
      }
      await _scanner.init();
      if (mounted) {
        setState(() {});
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _startupError = '$error';
        });
      }
    }
  }

  Future<void> _speak(String message) async {
    if (message.trim().isEmpty) {
      return;
    }
    try {
      await _ttsChannel.invokeMethod<void>('speak', message.trim());
    } catch (_) {
      // Keep scanning even if speech is unavailable on the device.
    }
  }

  Future<void> _openAdmin() async {
    if (_adminOpen) {
      return;
    }
    await _scanner.pause();
    if (mounted) {
      setState(() {
        _adminOpen = true;
      });
    }
  }

  Future<void> _closeAdmin() async {
    await _scanner.refreshEmployees();
    await _scanner.resume();
    if (mounted) {
      setState(() {
        _adminOpen = false;
      });
    }
  }

  @override
  void dispose() {
    _scanner.dispose();
    unawaited(_ttsChannel.invokeMethod<void>('stop'));
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Time Keep Native',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0B0D10),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF2F6BFF),
          surface: Color(0xFF0E1116),
        ),
        useMaterial3: true,
      ),
      home: _startupError != null
          ? Scaffold(
              body: Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    _startupError!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white70),
                  ),
                ),
              ),
            )
          : _adminOpen
              ? AdminScreen(onClose: _closeAdmin)
              : ScannerScreen(
                  controller: _scanner,
                  onAdminRequested: _openAdmin,
                ),
    );
  }
}
