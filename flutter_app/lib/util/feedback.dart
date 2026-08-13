import 'package:flutter/services.dart';

class FeedbackFx {
  static Future<void> scanCapture() async {
    await SystemSound.play(SystemSoundType.click);
    HapticFeedback.selectionClick();
  }

  static Future<void> success() async {
    await SystemSound.play(SystemSoundType.click);
    HapticFeedback.heavyImpact();
  }

  static Future<void> error() async {
    await SystemSound.play(SystemSoundType.alert);
    HapticFeedback.mediumImpact();
  }
}
