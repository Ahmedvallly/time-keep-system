# Flutter Shell

This folder contains a Flutter Android shell for the hosted `mobile.html` screen.

## Why this update model works

The Flutter app does not embed the attendance UI directly. It loads the hosted mobile web app from your server.

That means:

- Change `public/mobile.html`, `public/mobile.js`, or `public/styles.css`
- Deploy the server
- Installed phones pick up the new version automatically

No APK rebuild is needed for normal UI and logic changes inside the hosted mobile screen.

## What still requires a new APK

You still need a new APK if you change:

- native Android permissions
- the Flutter shell code
- the hardcoded API base URL at build time
- plugins or other native dependencies

## Generate the Android project

Flutter is not installed in this repo environment, so the native Android folders were not generated here.

After installing Flutter, run:

```powershell
cd flutter_app
flutter create . --platforms=android
flutter pub get
```

## Build

Point the shell at your hosted backend:

```powershell
flutter build apk --dart-define=API_BASE_URL=https://YOUR-HOSTED-DOMAIN
```

Example:

```powershell
flutter build apk --dart-define=API_BASE_URL=https://time-keep-system.onrender.com
```

## Server-side version updates

The app reads:

- `/api/app-shell-config`

The server returns:

- `mobileUrl`: the hosted screen to load
- `version`: bump this when you want devices to refresh
- `refreshIntervalMs`: how often the app checks for updates

When you deploy a new mobile web version, increase `MOBILE_APP_VERSION` on the server.
