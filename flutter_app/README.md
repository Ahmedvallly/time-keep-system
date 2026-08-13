# Flutter App

This folder contains the only Android APK app for the project.

## Architecture

- Flutter handles worker scan in and scan out.
- The hosted web admin dashboard at `/mobile-admin.html` handles worker setup, reports, leave, holidays, and time editing.
- The old Capacitor wrapper and old hosted mobile scanner page are no longer used.

## Build

Point the app at your hosted backend:

```powershell
flutter build apk --dart-define=API_BASE_URL=https://YOUR-HOSTED-DOMAIN
```

Example:

```powershell
flutter build apk --dart-define=API_BASE_URL=https://time-keep-system.onrender.com
```

## Rebuild when

You need a new APK when you change:

- Flutter code in `lib/`
- Android permissions or native code
- Flutter plugins or native dependencies
- the compile-time `API_BASE_URL`
