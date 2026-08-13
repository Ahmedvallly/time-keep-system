import 'package:camera/camera.dart';

const String defaultApiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://time-keep-system.onrender.com',
);
const String defaultAdminUrl = '$defaultApiBaseUrl/mobile-admin.html';

const String kModelAsset = 'assets/models/w600k_mbf.onnx';
const double kAcceptThreshold = 0.24;
const double kAmbiguityMargin = 0.03;
const int kMinSamples = 4;
const int kMaxSamples = 6;
const double kMinFaceWidthRatio = 0.18;
const double kMinBrightness = 28.0;
const double kMaxBrightness = 235.0;
const int kScanCooldownMs = 2500;
const int kResultHoldMs = 1800;
const int kMinBlinks = 0;
const double kMinBlinkProbability = 0.5;
const ResolutionPreset kCameraResolution = ResolutionPreset.medium;
