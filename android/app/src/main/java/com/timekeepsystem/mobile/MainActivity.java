package com.timekeepsystem.mobile;

import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    private static final String APP_SHELL_CONFIG_URL = "https://time-keep-system.onrender.com/api/app-shell-config";
    private static final long APP_SHELL_REFRESH_DEBOUNCE_MS = 15000;
    private static final String PREFS_NAME = "time_keep_mobile";
    private static final String PREF_LAST_APP_SHELL_VERSION = "last_app_shell_version";
    private static final String PREF_LAST_APP_SHELL_URL = "last_app_shell_url";
    private static final long RESUME_REFRESH_THRESHOLD_MS = 45000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private TextToSpeech textToSpeech;
    private boolean ttsReady = false;
    private String pendingSpeechMessage = null;
    private long lastAppShellRefreshAt = 0L;
    private long pausedAt = 0L;

    private final Runnable webEnhancementTask = new Runnable() {
        @Override
        public void run() {
            injectWebEnhancements();
            handler.postDelayed(this, 2500);
        }
    };

    private final Runnable appShellRefreshTask = new Runnable() {
        @Override
        public void run() {
            refreshHostedAppShell(false);
            handler.postDelayed(this, 300000);
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        initializeNativeTts();
        configureWebViewBridges();
        refreshHostedAppShell(true);
    }

    @Override
    public void onResume() {
        super.onResume();
        injectWebEnhancements();
        if (pausedAt > 0L && System.currentTimeMillis() - pausedAt >= RESUME_REFRESH_THRESHOLD_MS) {
            refreshHostedAppShell(false);
        }
        pausedAt = 0L;
    }

    @Override
    public void onPause() {
        pausedAt = System.currentTimeMillis();
        super.onPause();
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(webEnhancementTask);
        handler.removeCallbacks(appShellRefreshTask);
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

        WebSettings settings = webView.getSettings();
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setDomStorageEnabled(true);

        webView.addJavascriptInterface(new NativeTtsBridge(), "nativeTts");
        webView.addJavascriptInterface(new NativeAppBridge(), "nativeApp");
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> openExternalUrl(url));
        handler.postDelayed(webEnhancementTask, 1200);
        handler.postDelayed(appShellRefreshTask, 300000);
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

    private void refreshHostedAppShell(boolean force) {
        long now = System.currentTimeMillis();
        if (!force && now - lastAppShellRefreshAt < APP_SHELL_REFRESH_DEBOUNCE_MS) {
            return;
        }
        lastAppShellRefreshAt = now;

        new Thread(() -> {
            try {
                HttpURLConnection connection = (HttpURLConnection) new URL(APP_SHELL_CONFIG_URL).openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(10000);
                connection.setUseCaches(false);
                connection.setRequestProperty("Cache-Control", "no-cache");
                connection.setRequestProperty("Pragma", "no-cache");

                BufferedReader reader = new BufferedReader(
                    new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8)
                );
                StringBuilder response = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    response.append(line);
                }
                reader.close();
                connection.disconnect();

                JSONObject config = new JSONObject(response.toString());
                String version = config.optString("version", "");
                String mobileUrl = config.optString("mobileUrl", "");
                if (mobileUrl.isEmpty()) {
                    return;
                }

                SharedPreferences preferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
                String lastVersion = preferences.getString(PREF_LAST_APP_SHELL_VERSION, "");
                String lastUrl = preferences.getString(PREF_LAST_APP_SHELL_URL, "");
                boolean shouldReload = force || !version.equals(lastVersion) || !mobileUrl.equals(lastUrl);

                if (!shouldReload) {
                    runOnUiThread(() -> {
                        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                        if (webView != null) {
                            webView.clearCache(true);
                            webView.reload();
                        }
                    });
                    return;
                }

                preferences.edit()
                    .putString(PREF_LAST_APP_SHELL_VERSION, version)
                    .putString(PREF_LAST_APP_SHELL_URL, mobileUrl)
                    .apply();

                String cacheBustedUrl = appendCacheBuster(mobileUrl, version);
                runOnUiThread(() -> {
                    WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                    if (webView == null) {
                        return;
                    }
                    webView.clearHistory();
                    webView.clearCache(true);
                    webView.loadUrl(cacheBustedUrl);
                });
            } catch (Exception ignored) {
                runOnUiThread(() -> {
                    WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                    if (webView != null) {
                        webView.clearCache(true);
                        webView.reload();
                    }
                });
            }
        }).start();
    }

    private String appendCacheBuster(String url, String version) {
        Uri uri = Uri.parse(url);
        Uri.Builder builder = uri.buildUpon().clearQuery();
        for (String name : uri.getQueryParameterNames()) {
            if (!"_appShellTs".equals(name)) {
                for (String value : uri.getQueryParameters(name)) {
                    builder.appendQueryParameter(name, value);
                }
            }
        }
        builder.appendQueryParameter("_appShellTs", (version == null || version.isEmpty())
            ? String.valueOf(System.currentTimeMillis())
            : version + "-" + System.currentTimeMillis());
        return builder.build().toString();
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
