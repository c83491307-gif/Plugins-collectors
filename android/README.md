# Creazzy Universal AI — Android APK

This directory contains the native Android application shell for Creazzy Universal AI.

## What the APK does

- Opens the real Creazzy application hosted by the Cloudflare Worker.
- Lets the user configure the Worker URL inside the app.
- Keeps the Worker URL on-device.
- Provides a native **Scan** entry point backed by Scandit Barcode Capture.
- Returns scanned barcode data to the Creazzy web layer as a `creazzy-barcode` browser event.
- Does not contain provider API keys or Cloudflare secrets.

## Build

Open `android/` in Android Studio, or run:

```bash
gradle :app:assembleDebug
```

Optional build properties:

```bash
gradle :app:assembleDebug -PCREAZZY_BASE_URL=https://your-worker.workers.dev
gradle :app:assembleDebug -PSCANDIT_LICENSE_KEY=YOUR_SCANDIT_LICENSE_KEY
```

The repository CI also builds the debug APK and uploads it as a GitHub Actions artifact.

## Scandit

The project uses Scandit Data Capture SDK Android 8.6.0 for Barcode Capture. A valid Scandit license key is required at runtime for scanning. The license key is intentionally not committed.

## Production requirements

Set the actual Cloudflare Worker URL before distribution. Configure the Scandit license key through the CI secret `SCANDIT_LICENSE_KEY` or a local Gradle property. Never commit provider keys, `CREAZZY_API_TOKEN`, `APP_MASTER_KEY`, or the Scandit license key.


## Full Scanner Hub
The Android build now exposes Barcode Capture, SparkScan, MatrixScan Count, MatrixScan Batch, and MatrixScan AR through a native Scanner Hub. All Scandit modes are license-aware; no license key is committed to source. The web layer receives scanner events through the existing `creazzy-barcode` bridge.
