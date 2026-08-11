package com.timekeepsystem.mobile;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import java.util.Locale;

public class MainActivity extends BridgeActivity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private TextToSpeech textToSpeech;
    private boolean ttsReady = false;
    private String pendingSpeechMessage = null;

    private final Runnable webEnhancementTask = new Runnable() {
        @Override
        public void run() {
            injectWebEnhancements();
            handler.postDelayed(this, 2500);
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        initializeNativeTts();
        configureWebViewBridges();
    }

    @Override
    public void onResume() {
        super.onResume();
        injectWebEnhancements();
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(webEnhancementTask);
        if (textToSpeech != null) {
            textToSpeech.stop();
            textToSpeech.shutdown();
            textToSpeech = null;
        }
        super.onDestroy();
    }

    private void initializeNativeTts() {
        textToSpeech = new TextToSpeech(getApplicationContext(), status -> {
            if (status != TextToSpeech.SUCCESS) {
                return;
            }

            ttsReady = true;
            textToSpeech.setLanguage(Locale.forLanguageTag("en-ZA"));
            textToSpeech.setSpeechRate(0.95f);
            textToSpeech.setPitch(1f);

            if (pendingSpeechMessage != null && !pendingSpeechMessage.isEmpty()) {
                speakNative(pendingSpeechMessage);
                pendingSpeechMessage = null;
            }
        });
    }

    private void configureWebViewBridges() {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            return;
        }

        webView.addJavascriptInterface(new NativeTtsBridge(), "nativeTts");
        webView.addJavascriptInterface(new NativeAppBridge(), "nativeApp");
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> openExternalUrl(url));
        handler.postDelayed(webEnhancementTask, 1200);
    }

    private void injectWebEnhancements() {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            return;
        }

        String script =
            "(function() {" +
            "  function installStyle() {" +
            "    if (document.getElementById('native-app-enhancements')) return;" +
            "    var style = document.createElement('style');" +
            "    style.id = 'native-app-enhancements';" +
            "    style.textContent =" +
            "      '#mobileWorkerCameraPanel:not([hidden]){" +
            "position:fixed!important;inset:0!important;z-index:90!important;" +
            "padding:max(14px, env(safe-area-inset-top)) 14px calc(14px + env(safe-area-inset-bottom))!important;" +
            "margin:0!important;display:grid!important;align-content:stretch!important;" +
            "background:rgba(6,16,24,0.97)!important;}' +" +
            "      '#mobileWorkerCameraPanel:not([hidden]) .mobile-camera-shell{" +
            "min-height:calc(100dvh - 132px)!important;height:calc(100dvh - 132px)!important;" +
            "margin-bottom:0!important;border-radius:24px!important;}' +" +
            "      '#mobileWorkerCameraPanel:not([hidden]) .mobile-camera-target{" +
            "width:calc(100vw - 28px)!important;height:calc(100dvh - 156px)!important;}' +" +
            "      '#mobileWorkerCameraPanel:not([hidden]) .button{" +
            "min-height:50px!important;}';" +
            "    document.head.appendChild(style);" +
            "  }" +
            "  function bindPdfLinks() {" +
            "    document.querySelectorAll('a[href*=\"report.pdf\"], a[href*=\"weekly-report.pdf\"]').forEach(function(link) {" +
            "      if (link.dataset.nativeExternalBound === '1') return;" +
            "      link.dataset.nativeExternalBound = '1';" +
            "      link.addEventListener('click', function(event) {" +
            "        if (!window.nativeApp || typeof window.nativeApp.openExternal !== 'function') return;" +
            "        event.preventDefault();" +
            "        window.nativeApp.openExternal(new URL(link.getAttribute('href'), window.location.href).href);" +
            "      });" +
            "    });" +
            "  }" +
            "  installStyle();" +
            "  bindPdfLinks();" +
            "})();";

        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private void openExternalUrl(String url) {
        if (url == null || url.isEmpty()) {
            return;
        }

        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(intent);
        } catch (Exception ignored) {
        }
    }

    private void speakNative(String message) {
        if (message == null || message.trim().isEmpty()) {
            return;
        }

        if (!ttsReady || textToSpeech == null) {
            pendingSpeechMessage = message;
            return;
        }

        textToSpeech.stop();
        textToSpeech.speak(message, TextToSpeech.QUEUE_FLUSH, null, "scan-message");
    }

    private final class NativeTtsBridge {
        @JavascriptInterface
        public void postMessage(String message) {
            runOnUiThread(() -> speakNative(message));
        }
    }

    private final class NativeAppBridge {
        @JavascriptInterface
        public void openExternal(String url) {
            runOnUiThread(() -> openExternalUrl(url));
        }
    }
}
