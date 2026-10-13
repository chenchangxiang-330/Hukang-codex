#!/usr/bin/env bash
set -euo pipefail
# Runs only on the ephemeral GitHub emulator, using the downloaded signed APK.
mkdir -p smoke-evidence
adb shell getprop ro.build.version.sdk > smoke-evidence/device-api.txt
adb shell getprop ro.product.cpu.abi > smoke-evidence/device-abi.txt
adb shell getconf PAGESIZE > smoke-evidence/device-page-size.txt || true
timeout 180s bash scripts/smoke-android-apk.sh cloud-apk/HuKang-cloud-debug.apk
adb shell settings put global airplane_mode_on 1
adb shell svc wifi disable
adb shell svc data disable
adb shell dumpsys connectivity > smoke-evidence/ocr-offline-connectivity.txt
timeout 900s bash scripts/run-android-ocr-regression.sh mlkit
timeout 900s bash scripts/run-android-ocr-regression.sh paddle
timeout 480s bash scripts/run-android-storage-regression.sh "$(cat smoke-evidence/ocr-paddle-run-id.txt)"
node scripts/check-paddle-switch-gate.mjs smoke-evidence/ocr-regression-paddle.json smoke-evidence/ocr-score-paddle.json --require-default > smoke-evidence/paddle-default-gate.json
