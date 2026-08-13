library;

import 'dart:typed_data';

import '../config.dart';

enum QualityIssue { none, tooFar, poorLighting, multipleFaces }

class ScanQuality {
  static QualityIssue check({
    required int faceWidthPx,
    required int frameWidthPx,
    required double meanLuma,
    int faceCount = 1,
  }) {
    if (faceCount > 1) {
      return QualityIssue.multipleFaces;
    }
    if (faceWidthPx / frameWidthPx < kMinFaceWidthRatio) {
      return QualityIssue.tooFar;
    }
    if (meanLuma < kMinBrightness || meanLuma > kMaxBrightness) {
      return QualityIssue.poorLighting;
    }
    return QualityIssue.none;
  }
}

class LivenessTracker {
  bool? _eyesOpen;
  int _blinks = 0;
  int _frames = 0;

  int get blinks => _blinks;
  int get frames => _frames;
  bool get isSatisfied => _blinks >= kMinBlinks && _frames >= kMinSamples;

  void observe({
    required double leftOpen,
    required double rightOpen,
  }) {
    _frames += 1;
    final open = (leftOpen + rightOpen) / 2 >= kMinBlinkProbability;
    if (_eyesOpen == true && !open) {
      _blinks += 1;
    }
    _eyesOpen = open;
  }
}

class EnrollmentQuality {
  static bool acceptable({
    required double faceWidthRatio,
    required double meanLuma,
    required double yaw,
  }) {
    const maxYawDeg = 35.0;
    return faceWidthRatio >= 0.18 &&
        meanLuma >= 30 &&
        meanLuma <= 235 &&
        yaw.abs() <= maxYawDeg;
  }
}

class ImageSharpness {
  static double laplacianVariance(Uint8List gray, int width, int height) {
    if (width < 3 || height < 3) {
      return 0;
    }
    var sum = 0.0;
    var count = 0;
    for (var y = 1; y < height - 1; y++) {
      final row = y * width;
      final rowUp = row - width;
      final rowDown = row + width;
      for (var x = 1; x < width - 1; x++) {
        final center = gray[row + x];
        final lap = (gray[rowUp + x] +
                gray[rowDown + x] +
                gray[row + x - 1] +
                gray[row + x + 1]) -
            4 * center;
        sum += lap * lap;
        count += 1;
      }
    }
    return count == 0 ? 0 : sum / count;
  }

  static bool acceptable(double score, {double minScore = 140}) =>
      score >= minScore;

  static double faceRegionSharpness(
    Uint8List bgra,
    int width,
    int height,
    int boxLeft,
    int boxTop,
    int boxWidth,
    int boxHeight,
  ) {
    final scaledWidth = boxWidth ~/ 2;
    final scaledHeight = boxHeight ~/ 2;
    if (scaledWidth < 3 || scaledHeight < 3) {
      return 0;
    }

    final luma = Uint8List(scaledWidth * scaledHeight);
    for (var y = 0; y < scaledHeight; y++) {
      final sourceY = boxTop + y * 2;
      if (sourceY < 0 || sourceY >= height) {
        continue;
      }
      for (var x = 0; x < scaledWidth; x++) {
        final sourceX = boxLeft + x * 2;
        if (sourceX < 0 || sourceX >= width) {
          continue;
        }
        luma[y * scaledWidth + x] = bgra[(sourceY * width + sourceX) * 4 + 2];
      }
    }
    return laplacianVariance(luma, scaledWidth, scaledHeight);
  }
}
