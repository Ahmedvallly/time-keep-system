package com.timekeepsystem.mobile

import android.os.Bundle
import android.speech.tts.TextToSpeech
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.util.Locale

class MainActivity : FlutterActivity() {
    private val channelName = "com.timekeepsystem.mobile/tts"
    private var textToSpeech: TextToSpeech? = null
    private var ttsReady = false
    private var pendingSpeechMessage: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        textToSpeech = TextToSpeech(applicationContext) { status ->
            if (status != TextToSpeech.SUCCESS) {
                return@TextToSpeech
            }
            textToSpeech?.language = Locale.forLanguageTag("en-ZA")
            textToSpeech?.setSpeechRate(0.45f)
            textToSpeech?.setPitch(1.0f)
            ttsReady = true
            pendingSpeechMessage?.let {
                speak(it)
                pendingSpeechMessage = null
            }
        }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "speak" -> {
                        val message = call.arguments as? String ?: ""
                        speak(message)
                        result.success(null)
                    }
                    "stop" -> {
                        textToSpeech?.stop()
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            }
    }

    private fun speak(message: String) {
        val trimmed = message.trim()
        if (trimmed.isEmpty()) {
            return
        }

        val tts = textToSpeech
        if (!ttsReady || tts == null) {
            pendingSpeechMessage = trimmed
            return
        }

        tts.stop()
        tts.speak(trimmed, TextToSpeech.QUEUE_FLUSH, null, "scan-message")
    }

    override fun onDestroy() {
        textToSpeech?.stop()
        textToSpeech?.shutdown()
        textToSpeech = null
        super.onDestroy()
    }
}
