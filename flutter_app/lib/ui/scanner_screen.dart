import 'dart:async';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';

import '../scanner/scan_flow.dart';

class ScannerScreen extends StatefulWidget {
  const ScannerScreen({
    super.key,
    required this.controller,
    required this.onAdminRequested,
  });

  final ScanFlowController controller;
  final VoidCallback onAdminRequested;

  @override
  State<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends State<ScannerScreen> {
  Timer? _clock;

  @override
  void initState() {
    super.initState();
    _clock = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) {
        setState(() {});
      }
    });
  }

  @override
  void dispose() {
    _clock?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B0D10),
      body: SafeArea(
        child: Stack(
          fit: StackFit.expand,
          children: [
            ListenableBuilder(
              listenable: widget.controller,
              builder: (context, _) {
                final CameraController? camera = widget.controller.camera;
                if (camera == null || !camera.value.isInitialized) {
                  return const Center(
                    child: CircularProgressIndicator(color: Colors.white24),
                  );
                }
                return CameraPreview(camera);
              },
            ),
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 14, 14, 0),
                child: Row(
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Time Keep Face Scanner',
                          style: TextStyle(
                            color: Colors.white70,
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 0.4,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          _clockLabel(),
                          style: const TextStyle(
                            color: Colors.white54,
                            fontSize: 12,
                            fontFeatures: [FontFeature.tabularFigures()],
                          ),
                        ),
                      ],
                    ),
                    const Spacer(),
                    FilledButton.tonalIcon(
                      onPressed: widget.onAdminRequested,
                      icon: const Icon(Icons.lock_outline_rounded, size: 20),
                      label: const Text('Admin'),
                      style: FilledButton.styleFrom(
                        foregroundColor: Colors.white,
                        backgroundColor: Colors.black45,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 12,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Positioned(
              top: 96,
              left: 0,
              right: 0,
              child: Center(
                child: ListenableBuilder(
                  listenable: widget.controller,
                  builder: (context, _) {
                    final readyCount = widget.controller.templateCount;
                    final workerCount = widget.controller.workerCount;
                    return Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: const Color(0xCC3A2E14),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Text(
                        readyCount == 0
                            ? 'No scan-ready face profiles enrolled yet'
                            : '$readyCount face profiles ready across $workerCount workers',
                        style: const TextStyle(
                            color: Color(0xFFFFC857), fontSize: 12),
                      ),
                    );
                  },
                ),
              ),
            ),
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: Container(
                padding: const EdgeInsets.fromLTRB(24, 18, 24, 30),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Colors.transparent, Color(0xE60B0D10)],
                    stops: [0.0, 0.55],
                  ),
                ),
                child: ListenableBuilder(
                  listenable: widget.controller,
                  builder: (context, _) {
                    final outcome = widget.controller.outcome;
                    if (outcome != null) {
                      return _ResultContent(outcome: outcome);
                    }
                    final message = _promptFor(widget.controller.phase,
                        widget.controller.hasTemplates);
                    return Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        if (widget.controller.phase == ScanPhase.scanning)
                          const Padding(
                            padding: EdgeInsets.only(right: 12),
                            child: SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.4,
                                color: Colors.white70,
                              ),
                            ),
                          ),
                        Flexible(
                          child: Text(
                            message,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _clockLabel() {
    final now = DateTime.now();
    final time =
        '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}:${now.second.toString().padLeft(2, '0')}';
    final date = '${_month(now.month)} ${now.day}, ${now.year}';
    return '$time  |  $date';
  }

  String _month(int month) {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec'
    ];
    return months[month - 1];
  }

  String _promptFor(ScanPhase phase, bool hasTemplates) {
    if (!hasTemplates) {
      return 'Add a worker and enroll their face from Admin before scanning.';
    }
    switch (phase) {
      case ScanPhase.init:
        return 'Starting scanner...';
      case ScanPhase.idle:
        return 'Look at the camera';
      case ScanPhase.scanning:
      case ScanPhase.faceDetected:
        return 'Hold still for face scan...';
      case ScanPhase.faceTooFar:
        return 'Move closer to the camera';
      case ScanPhase.poorLighting:
        return 'Lighting is too low or too bright';
      case ScanPhase.multipleFaces:
        return 'Only one person in frame';
      case ScanPhase.unknown:
        return 'Face not recognized';
      case ScanPhase.ambiguous:
        return 'Unclear match. Try again';
      case ScanPhase.livenessFailed:
        return 'Hold still, move closer, and try again';
      case ScanPhase.backendFailure:
        return 'Could not save scan';
      case ScanPhase.checkIn:
      case ScanPhase.checkOut:
        return 'Scan complete';
    }
  }
}

class _ResultContent extends StatelessWidget {
  const _ResultContent({required this.outcome});

  final ScanOutcome outcome;

  @override
  Widget build(BuildContext context) {
    final (icon, color, title, subtitle) = _contentForOutcome(outcome);
    final time = outcome.at == null
        ? null
        : '${outcome.at!.hour.toString().padLeft(2, '0')}:${outcome.at!.minute.toString().padLeft(2, '0')}:${outcome.at!.second.toString().padLeft(2, '0')}';
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, color: color, size: 42),
        const SizedBox(height: 12),
        Text(
          title,
          style: TextStyle(
            color: color,
            fontSize: 24,
            fontWeight: FontWeight.w700,
          ),
        ),
        if (subtitle.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(
            subtitle,
            textAlign: TextAlign.center,
            style: const TextStyle(
                color: Colors.white, fontSize: 17, fontWeight: FontWeight.w500),
          ),
        ],
        if (time != null) ...[
          const SizedBox(height: 4),
          Text(
            time,
            style: const TextStyle(
              color: Colors.white54,
              fontSize: 15,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ],
    );
  }

  (IconData, Color, String, String) _contentForOutcome(ScanOutcome outcome) {
    switch (outcome.phase) {
      case ScanPhase.checkIn:
        return (
          Icons.login_rounded,
          const Color(0xFF2FBF71),
          'Checked in',
          outcome.employeeName ?? '',
        );
      case ScanPhase.checkOut:
        return (
          Icons.logout_rounded,
          const Color(0xFF4DA3FF),
          'Checked out',
          outcome.employeeName ?? '',
        );
      case ScanPhase.ambiguous:
        return (
          Icons.error_outline_rounded,
          const Color(0xFFFFC857),
          'Unclear match',
          outcome.message ?? '',
        );
      case ScanPhase.unknown:
        return (
          Icons.person_off_rounded,
          const Color(0xFFFF5D5D),
          'Face not recognized',
          outcome.message ?? '',
        );
      case ScanPhase.backendFailure:
        return (
          Icons.cloud_off_rounded,
          const Color(0xFFFF5D5D),
          'Scan failed',
          outcome.message ?? '',
        );
      case ScanPhase.livenessFailed:
        return (
          Icons.visibility_off_rounded,
          const Color(0xFFFFC857),
          'Blink not detected',
          outcome.message ?? '',
        );
      default:
        return (
          Icons.info_outline_rounded,
          const Color(0xFFFFC857),
          'Please try again',
          outcome.message ?? '',
        );
    }
  }
}
