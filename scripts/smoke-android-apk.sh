#!/usr/bin/env bash
set -euo pipefail

apk_path="${1:?Pass the downloaded Debug APK path}"
app_package='com.hukang.local.clouddebug'
mkdir -p smoke-evidence
trap 'adb logcat -d > smoke-evidence/logcat.txt 2>&1 || true' EXIT

test -s "$apk_path"
sha256sum -c cloud-apk/SHA256SUMS
adb wait-for-device
adb logcat -c
adb install "$apk_path" | tee smoke-evidence/install.txt
grep -q 'Success' smoke-evidence/install.txt
adb shell pm path "$app_package" | tee smoke-evidence/package.txt
grep -q '^package:' smoke-evidence/package.txt

# No Metro process or port forwarding is started on this runner.
adb shell am start -W -n "$app_package/com.hukang.local.MainActivity" | tee smoke-evidence/launch.txt
grep -q 'Status: ok' smoke-evidence/launch.txt
sleep 20
adb shell pidof "$app_package" | tee smoke-evidence/pid.txt
test -s smoke-evidence/pid.txt
adb shell uiautomator dump /sdcard/hukang-window.xml
adb pull /sdcard/hukang-window.xml smoke-evidence/window.xml
adb exec-out screencap -p > smoke-evidence/launch.png
adb logcat -d -b crash > smoke-evidence/crash.txt
if grep -q 'FATAL EXCEPTION' smoke-evidence/crash.txt; then
  cat smoke-evidence/crash.txt
  exit 1
fi
grep -q "package=\"$app_package\"" smoke-evidence/window.xml
grep -Eq '建立本地健康档案|保存并开始使用|今日营养' smoke-evidence/window.xml
if grep -Eq 'Unable to load script|Could not connect to development server|RedBox' smoke-evidence/window.xml; then
  exit 1
fi
printf 'APK downloaded, checksum verified, installed and launched without Metro.\n' | tee smoke-evidence/result.txt
