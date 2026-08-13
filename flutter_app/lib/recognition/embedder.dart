import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui';

import 'package:camera/camera.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:onnxruntime/onnxruntime.dart';

import '../config.dart';
import 'matcher.dart';

class FaceEmbedder {
  OrtSession? _session;
  bool _ready = false;
  String? _error;

  bool get ready => _ready;
  String? get error => _error;

  Future<void> init() async {
    try {
      OrtEnv.instance.init(level: OrtLoggingLevel.error);
      final options = OrtSessionOptions()..setIntraOpNumThreads(2);
      final bytes = await rootBundle.load(kModelAsset);
      _session = OrtSession.fromBuffer(
        bytes.buffer.asUint8List(bytes.offsetInBytes, bytes.lengthInBytes),
        options,
      );
      _ready = true;
    } catch (error) {
      _error = 'model init failed: $error';
    }
  }

  List<double>? embed({
    required Uint8List rgba,
    required int width,
    required int height,
    required List<Offset> landmarks,
  }) {
    final session = _session;
    if (session == null) {
      return null;
    }

    final input = alignedFaceTensor(rgba, width, height, landmarks);
    final runOptions = OrtRunOptions();
    final inputValue = OrtValueTensor.createTensorWithDataList(
      input,
      [1, 3, 112, 112],
    );
    final outputs = session.run(runOptions, {'input.1': inputValue});
    inputValue.release();
    runOptions.release();
    final output = outputs.first;
    if (output == null) {
      return null;
    }

    final value = output.value as dynamic;
    output.release();
    if (value is! List) {
      return null;
    }

    final flat = <double>[];
    for (final item in value) {
      if (item is List) {
        flat.addAll(item.cast<double>());
      } else {
        flat.add((item as num).toDouble());
      }
    }
    if (flat.length < 128) {
      return null;
    }
    return l2Normalize(flat);
  }

  Float32List alignedFaceTensor(
    Uint8List rgba,
    int width,
    int height,
    List<Offset> landmarks,
  ) {
    const target = <Offset>[
      Offset(38.2946, 51.6963),
      Offset(73.5318, 51.5014),
      Offset(56.0252, 71.7366),
      Offset(41.5493, 92.3655),
      Offset(70.7299, 92.2041),
    ];
    final transform = _similarityTransform(landmarks, target);
    final output = Float32List(112 * 112 * 3);
    final inverse = _invert(transform);
    var index = 0;
    for (var y = 0; y < 112; y++) {
      for (var x = 0; x < 112; x++) {
        final sourceX = inverse[0] * x + inverse[1] * y + inverse[4];
        final sourceY = inverse[2] * x + inverse[3] * y + inverse[5];
        final blue = _bilinearAt(rgba, width, height, sourceX, sourceY, 0);
        final green = _bilinearAt(rgba, width, height, sourceX, sourceY, 1);
        final red = _bilinearAt(rgba, width, height, sourceX, sourceY, 2);
        output[index++] = red / 127.5 - 1.0;
        output[index++] = green / 127.5 - 1.0;
        output[index++] = blue / 127.5 - 1.0;
      }
    }
    return output;
  }
}

List<double> _similarityTransform(List<Offset> source, List<Offset> target) {
  final count = source.length;
  var sourceX = 0.0;
  var sourceY = 0.0;
  var targetX = 0.0;
  var targetY = 0.0;
  for (var i = 0; i < count; i++) {
    sourceX += source[i].dx;
    sourceY += source[i].dy;
    targetX += target[i].dx;
    targetY += target[i].dy;
  }
  sourceX /= count;
  sourceY /= count;
  targetX /= count;
  targetY /= count;

  var d1 = 0.0;
  var d2 = 0.0;
  var d3 = 0.0;
  var d4 = 0.0;
  for (var i = 0; i < count; i++) {
    final x = source[i].dx - sourceX;
    final y = source[i].dy - sourceY;
    final u = target[i].dx - targetX;
    final v = target[i].dy - targetY;
    d1 += x * u + y * v;
    d2 += x * v - y * u;
    d3 += x * x + y * y;
    d4 += u * u + v * v;
  }
  final scale = math.sqrt(d4 / d3);
  final theta = math.atan2(d2, d1);
  final c = scale * math.cos(theta);
  final s = scale * math.sin(theta);
  return [
    c,
    -s,
    s,
    c,
    targetX - c * sourceX + s * sourceY,
    targetY - s * sourceX - c * sourceY
  ];
}

List<double> _invert(List<double> matrix) {
  final det = matrix[0] * matrix[3] - matrix[1] * matrix[2];
  final inverseDet = 1 / det;
  return [
    matrix[3] * inverseDet,
    -matrix[1] * inverseDet,
    -matrix[2] * inverseDet,
    matrix[0] * inverseDet,
    -(matrix[3] * matrix[4] - matrix[1] * matrix[5]) * inverseDet,
    -(-matrix[2] * matrix[4] + matrix[0] * matrix[5]) * inverseDet,
  ];
}

double _bilinearAt(
    Uint8List bgra, int width, int height, double x, double y, int channel) {
  if (x < 0 || x > width - 1 || y < 0 || y > height - 1) {
    return 0;
  }
  final x0 = x.floor();
  final y0 = y.floor();
  final x1 = math.min(x0 + 1, width - 1);
  final y1 = math.min(y0 + 1, height - 1);
  final weightX = x - x0;
  final weightY = y - y0;
  final i00 = (y0 * width + x0) * 4 + channel;
  final i10 = (y0 * width + x1) * 4 + channel;
  final i01 = (y1 * width + x0) * 4 + channel;
  final i11 = (y1 * width + x1) * 4 + channel;
  final v00 = bgra[i00];
  final v10 = bgra[i10];
  final v01 = bgra[i01];
  final v11 = bgra[i11];
  final top = v00 + (v10 - v00) * weightX;
  final bottom = v01 + (v11 - v01) * weightX;
  return top + (bottom - top) * weightY;
}

Uint8List nv21FromPlanes(
  List<Uint8List> planeBytes,
  List<int> planeStrides, {
  required int width,
  required int height,
}) {
  final ySize = width * height;
  final total = ySize + ySize ~/ 2;
  final output = Uint8List(total);
  final source = planeBytes[0];

  if (planeBytes.length == 1 && source.length >= total) {
    output.setRange(0, total, source);
    return output;
  }

  final bytesPerRow = planeStrides[0];
  if (bytesPerRow == width) {
    output.setRange(0, ySize, source);
  } else {
    for (var row = 0; row < height; row++) {
      output.setRange(
          row * width, row * width + width, source, row * bytesPerRow);
    }
  }

  if (planeBytes.length >= 3) {
    final u = planeBytes[1];
    final v = planeBytes[2];
    final uBpr = planeStrides[1];
    final vBpr = planeStrides[2];
    final chromaWidth = width >> 1;
    final chromaHeight = height >> 1;
    for (var row = 0; row < chromaHeight; row++) {
      for (var col = 0; col < chromaWidth; col++) {
        final destination = ySize + (row * chromaWidth + col) * 2;
        output[destination] = v[row * vBpr + col];
        output[destination + 1] = u[row * uBpr + col];
      }
    }
  } else if (planeBytes.length == 2) {
    output.setRange(ySize, total, planeBytes[1], 0);
  } else {
    for (var i = ySize; i < total; i += 2) {
      output[i] = 128;
      output[i + 1] = 128;
    }
  }

  return output;
}

Uint8List nv21Of(CameraImage image) {
  return nv21FromPlanes(
    [for (final plane in image.planes) plane.bytes],
    [for (final plane in image.planes) plane.bytesPerRow],
    width: image.width,
    height: image.height,
  );
}

({Uint8List bytes, int width, int height}) nv21ToUprightBgra(
  Uint8List nv21,
  int width,
  int height,
  int rotationDeg, {
  bool mirrorX = false,
}) {
  final outWidth = (rotationDeg % 180) != 0 ? height : width;
  final outHeight = (rotationDeg % 180) != 0 ? width : height;
  final output = Uint8List(outWidth * outHeight * 4);

  int lumaAt(int x, int y) => nv21[y * width + x];
  int chromaAt(int x, int y, bool isV) {
    final index = width * height + ((y >> 1) * (width >> 1) + (x >> 1)) * 2;
    return nv21[index + (isV ? 0 : 1)];
  }

  for (var outputY = 0; outputY < outHeight; outputY++) {
    for (var outputX = 0; outputX < outWidth; outputX++) {
      final finalX = mirrorX ? outWidth - 1 - outputX : outputX;
      int sourceX;
      int sourceY;
      switch (rotationDeg % 360) {
        case 90:
          sourceX = width - 1 - outputY;
          sourceY = outputX;
        case 270:
          sourceX = outputY;
          sourceY = height - 1 - outputX;
        case 180:
          sourceX = width - 1 - outputX;
          sourceY = height - 1 - outputY;
        default:
          sourceX = outputX;
          sourceY = outputY;
      }

      final yValue = lumaAt(sourceX, sourceY);
      final uValue = chromaAt(sourceX, sourceY, false) - 128;
      final vValue = chromaAt(sourceX, sourceY, true) - 128;
      final red = (yValue + 1.402 * vValue).round().clamp(0, 255);
      final green = (yValue - 0.344136 * uValue - 0.714136 * vValue)
          .round()
          .clamp(0, 255);
      final blue = (yValue + 1.772 * uValue).round().clamp(0, 255);
      final index = (outputY * outWidth + finalX) * 4;
      output[index] = blue;
      output[index + 1] = green;
      output[index + 2] = red;
      output[index + 3] = 255;
    }
  }
  return (bytes: output, width: outWidth, height: outHeight);
}

({Uint8List bytes, int width, int height}) yuvToUprightRgba(
  CameraImage image,
  int rotationDeg, {
  bool mirrorX = false,
}) {
  return nv21ToUprightBgra(
    nv21Of(image),
    image.width,
    image.height,
    rotationDeg,
    mirrorX: mirrorX,
  );
}
