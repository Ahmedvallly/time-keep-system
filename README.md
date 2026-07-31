# Time Keep System

Attendance tracker with a MongoDB Atlas backend and a Vercel-ready deployment target.

The server now stores worker, scan, leave, and holiday data in MongoDB. The JSON files in `data/` are only local snapshots for inspection and fallback.

## What it does

- Records each scan against a worker code.
- Automatically advances the worker through this daily flow:
  1. `clock_in`
  2. `break_out`
  3. `break_in`
  4. `clock_out`
- Supports different monthly target hours per worker.
- Calculates worked hours and break hours from scan pairs.
- Exports a payroll summary CSV that opens directly in Excel.
- Exports raw monthly time rows for Excel editing and imports the edited CSV back.
- Automatically keeps a live Excel-ready CSV updated after every scan.
- Lets you add, edit, and delete individual time rows from the browser.

## Run it

```powershell
node server.js
```

Open `http://localhost:3000`.

For a phone-friendly screen, open `http://YOUR-PC-IP:3000/mobile.html` from the same network.

For a hosted setup, deploy this repo to Vercel and use MongoDB Atlas for the shared database.

## Files

- `db.js`: MongoDB-backed storage layer.
- `data/employees.json`: local worker snapshot.
- `data/scans.json`: local scan snapshot.
- `data/attendance-live-times.csv`: live scan sheet refreshed after every scan or edit.
- `public/`: dashboard UI.
- `api/index.js`: Vercel serverless entrypoint.
- `vercel.json`: Vercel routing config.
- `.env.example`: required environment variables.

## Environment

Set these variables before starting in production:

- `MONGODB_URI`: MongoDB Atlas or MongoDB server connection string.
- `MONGODB_DB`: database name, default `time_keep_system`.
- `PORT`: local HTTP port. Vercel ignores this.

## Atlas + Vercel deploy

1. Create a MongoDB Atlas cluster.
2. Create a database user in Atlas.
3. In Atlas Network Access, allow Vercel to connect. The simplest first test is a temporary `0.0.0.0/0` rule, then tighten it later if you want stricter access.
4. Copy your Atlas connection string into `MONGODB_URI`.
5. Push this project to GitHub.
6. Import the repo into Vercel.
7. In Vercel Project Settings, add:
   - `MONGODB_URI`
   - `MONGODB_DB`
8. Deploy.
9. After deploy, test `https://YOUR-VERCEL-URL/api/health`
10. Update `capacitor.config.json` so `server.url` points to `https://YOUR-VERCEL-URL/mobile.html`
11. Run `npm run android:sync` and rebuild the APK so installed phones load the Vercel-hosted app.

The hosted app serves both the desktop web UI and the phone web UI from the same backend.

Once the APK is rebuilt with the Vercel URL, every device using that app talks to the same Vercel app and the same MongoDB Atlas database. That is what makes scans, leave edits, and worker data visible across devices.

## Excel workflow

1. Scan a finger or enter a worker code in the app.
2. The system immediately refreshes `data/attendance-live-times.csv`.
3. Open that file in Excel and edit the `Timestamp`, `Employee Code`, or `Event Type` columns.
4. Save the sheet as a CSV file.
5. Use **Import edited CSV** in the app to load the changes back into the shared database.

If you only want one month, use **Export times for Excel** to download that month separately.

You can also use the **Adjust times** section in the app to fix a row manually without opening Excel.

## Fingerprint device options

This project does not depend on one specific fingerprint machine. That matters because each vendor exposes data differently.

### Best-case option

If your fingerprint reader behaves like a keyboard and outputs a worker code followed by Enter, place the cursor in the **Scan worker** field. The reader can then feed the app directly.

### API option

If your machine or middleware can call a URL, send a `POST` request to:

`/api/scans`

JSON body:

```json
{
  "employeeCode": "1001",
  "timestamp": "2026-06-10T06:00:00Z"
}
```

### Export/import option

If your device only exports logs, use the worker code from the fingerprint machine as the `code` value in the worker form. The next step would be a small import script for your device's CSV format.

## Xero note

Xero integration depends on your Xero region and payroll product. The safest first step is the CSV export because it can be reviewed in Excel before payroll is updated.

If you want direct Xero syncing later, the next phase should be:

1. Confirm which Xero product and country payroll API you use.
2. Match each worker here to the employee record in Xero.
3. Push approved timesheet totals instead of raw scan events.

## Mobile app note

This repo includes a mobile web screen at `/mobile.html` that uses the same backend API as the desktop screen. That means if a worker scans in or out, you can see it on your phone immediately and edit times from your phone as well.

There is also a debug Android APK wrapper in this repo. For shared data, the important part is that the wrapper loads the hosted `mobile.html` page from your Vercel deployment instead of a local server or the previous Render URL.

## Flutter shell update flow

This repo now includes a Flutter shell source app in [`flutter_app`](./flutter_app) that loads the hosted mobile web screen from the server.

### Why this avoids APK rebuilds for normal changes

If you change:

- `public/mobile.html`
- `public/mobile.js`
- `public/styles.css`

and then redeploy the server, installed phones can pick up the update automatically because the Flutter shell is only displaying the hosted page.

The server exposes `/api/app-shell-config`, which returns:

- the hosted mobile URL
- a `version` value
- a refresh interval

When you deploy a new web version, bump `MOBILE_APP_VERSION` in the server environment. The installed Flutter shell polls that endpoint and reloads the hosted page when the version changes.

### What still needs a new APK

You still need to rebuild the APK if you change:

- Flutter code in `flutter_app/lib`
- Android permissions or native plugins
- the compile-time `API_BASE_URL`

### Flutter build steps

Flutter is not installed in this local environment, so the Android project was not generated here. After installing Flutter:

```powershell
cd flutter_app
flutter create . --platforms=android
flutter pub get
flutter build apk --dart-define=API_BASE_URL=https://YOUR-HOSTED-DOMAIN
```
