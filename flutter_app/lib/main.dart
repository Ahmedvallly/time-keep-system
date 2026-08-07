import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

const String defaultApiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://time-keep-system.onrender.com',
);

void main() {
  runApp(const TimeKeepMobileApp());
}

class TimeKeepMobileApp extends StatelessWidget {
  const TimeKeepMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Time Keep Mobile',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0B6E4F),
          brightness: Brightness.light,
        ),
        useMaterial3: true,
      ),
      home: const AppShellScreen(),
    );
  }
}

class AppShellScreen extends StatefulWidget {
  const AppShellScreen({super.key});

  @override
  State<AppShellScreen> createState() => _AppShellScreenState();
}

class _AppShellScreenState extends State<AppShellScreen> {
  late final WebViewController _controller;
  Timer? _versionTimer;
  AppShellConfig? _config;
  Object? _error;
  bool _isLoading = true;
  bool _isRefreshing = false;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController();
    _configureWebViewController(_controller);

    unawaited(_loadInitialConfig());
  }

  @override
  void dispose() {
    _versionTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadInitialConfig() async {
    try {
      await _ensureCameraPermission();
      final config = await fetchAppShellConfig();
      await _controller.loadRequest(Uri.parse(config.mobileUrl));

      if (!mounted) {
        return;
      }

      setState(() {
        _config = config;
        _error = null;
      });
      _startVersionPolling(config.refreshIntervalMs);
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _error = error;
        _isLoading = false;
      });
    }
  }

  void _startVersionPolling(int refreshIntervalMs) {
    _versionTimer?.cancel();
    _versionTimer = Timer.periodic(
      Duration(milliseconds: refreshIntervalMs),
      (_) => unawaited(_refreshConfigIfNeeded()),
    );
  }

  Future<void> _refreshConfigIfNeeded() async {
    if (_isRefreshing) {
      return;
    }

    _isRefreshing = true;
    try {
      final nextConfig = await fetchAppShellConfig();
      final currentConfig = _config;

      if (currentConfig == null) {
        _config = nextConfig;
        return;
      }

      final versionChanged = nextConfig.version != currentConfig.version;
      final urlChanged = nextConfig.mobileUrl != currentConfig.mobileUrl;

      if (versionChanged || urlChanged) {
        await _controller.loadRequest(Uri.parse(nextConfig.mobileUrl));
      } else {
        await _controller.reload();
      }

      if (mounted) {
        setState(() {
          _config = nextConfig;
          _error = null;
        });
      } else {
        _config = nextConfig;
      }
    } catch (_) {
      // Keep the current screen if the version check fails.
    } finally {
      _isRefreshing = false;
    }
  }

  Future<void> _forceRefresh() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      await _ensureCameraPermission();
      final nextConfig = await fetchAppShellConfig();
      await _controller.loadRequest(Uri.parse(nextConfig.mobileUrl));
      if (!mounted) {
        return;
      }

      setState(() {
        _config = nextConfig;
      });
      _startVersionPolling(nextConfig.refreshIntervalMs);
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _error = error;
        _isLoading = false;
      });
    }
  }

  void _configureWebViewController(WebViewController controller) {
    controller
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) {
            if (mounted) {
              setState(() {
                _isLoading = true;
              });
            }
          },
          onPageFinished: (_) {
            if (mounted) {
              setState(() {
                _isLoading = false;
              });
            }
          },
          onWebResourceError: (error) {
            if (mounted) {
              setState(() {
                _error = error.description;
                _isLoading = false;
              });
            }
          },
        ),
      );

    final platformController = controller.platform;
    if (platformController is AndroidWebViewController) {
      AndroidWebViewController.enableDebugging(true);
      platformController.setMediaPlaybackRequiresUserGesture(false);
      platformController.setOnPlatformPermissionRequest(
        (PlatformWebViewPermissionRequest request) async {
          final status = await _ensureCameraPermission();
          if (status.isGranted) {
            await request.grant();
            return;
          }
          await request.deny();
        },
      );
    }
  }

  Future<PermissionStatus> _ensureCameraPermission() async {
    var status = await Permission.camera.status;
    if (status.isGranted) {
      return status;
    }

    status = await Permission.camera.request();
    if (status.isGranted) {
      return status;
    }

    throw Exception('Camera permission was denied. Allow camera access for the face scanner.');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Time Keep Mobile'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: _forceRefresh,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: Stack(
        children: [
          if (_error != null && _config == null)
            _ErrorState(
              message: _error.toString(),
              onRetry: _forceRefresh,
            )
          else
            WebViewWidget(controller: _controller),
          if (_isLoading)
            const LinearProgressIndicator(minHeight: 3),
        ],
      ),
      bottomNavigationBar: _config == null
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                child: Text(
                  'Live shell version ${_config!.version}',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
            ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({
    required this.message,
    required this.onRetry,
  });

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off, size: 48),
            const SizedBox(height: 16),
            Text(
              'The app shell could not reach the hosted mobile screen.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: onRetry,
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

class AppShellConfig {
  AppShellConfig({
    required this.version,
    required this.mobileUrl,
    required this.refreshIntervalMs,
  });

  final String version;
  final String mobileUrl;
  final int refreshIntervalMs;

  factory AppShellConfig.fromJson(Map<String, dynamic> json) {
    return AppShellConfig(
      version: json['version'] as String? ?? 'unknown',
      mobileUrl: json['mobileUrl'] as String? ?? '',
      refreshIntervalMs: json['refreshIntervalMs'] as int? ?? 300000,
    );
  }
}

Future<AppShellConfig> fetchAppShellConfig() async {
  final baseUri = Uri.parse(defaultApiBaseUrl);
  final configUri = baseUri.replace(
    path: '${baseUri.path.replaceFirst(RegExp(r'/$'), '')}/api/app-shell-config',
  );

  final client = HttpClient();
  try {
    final request = await client.getUrl(configUri);
    final response = await request.close();
    final body = await utf8.decodeStream(response);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw HttpException(
        'Config request failed with status ${response.statusCode}',
        uri: configUri,
      );
    }

    final json = jsonDecode(body) as Map<String, dynamic>;
    final config = AppShellConfig.fromJson(json);
    if (config.mobileUrl.isEmpty) {
      throw const FormatException('The app shell config did not include a mobile URL.');
    }
    return AppShellConfig(
      version: config.version,
      mobileUrl: normalizeMobileUrl(config.mobileUrl),
      refreshIntervalMs: config.refreshIntervalMs,
    );
  } finally {
    client.close(force: true);
  }
}

String normalizeMobileUrl(String url) {
  final uri = Uri.parse(url);
  if (uri.scheme == 'http' && !_isLocalHost(uri.host)) {
    return uri.replace(scheme: 'https').toString();
  }
  return url;
}

bool _isLocalHost(String host) {
  final value = host.toLowerCase();
  return value == 'localhost' || value == '127.0.0.1' || value == '::1';
}
