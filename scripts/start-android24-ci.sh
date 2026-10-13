#!/usr/bin/env bash
set -euo pipefail
# Android 24 hung in emulator-runner's unbounded `input keyevent 82` before
# any app command. Boot a fresh runner AVD without that optional unlock step.
# No local Mac tools, existing AVDs, APK data or user devices are touched.
mkdir -p smoke-evidence
export ANDROID_AVD_HOME="${RUNNER_TEMP:?}/hukang-api24-avd"
export ANDROID_SERIAL=emulator-5554
mkdir -p "$ANDROID_AVD_HOME"
sdk_tools="$ANDROID_HOME/cmdline-tools/latest/bin"
# Ignore only yes's expected SIGPIPE; preserve the SDK manager's exit status.
set +o pipefail
yes | "$sdk_tools/sdkmanager" --licenses > smoke-evidence/sdk-license-acceptance.txt
set -o pipefail
"$sdk_tools/sdkmanager" --install 'platform-tools' 'emulator' 'system-images;android-24;google_apis;x86_64'
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$sdk_tools:$PATH"
command -v adb > smoke-evidence/adb-path.txt
adb version > smoke-evidence/adb-version.txt
printf 'no\n' | "$sdk_tools/avdmanager" create avd --force --name hukang-api24 --package 'system-images;android-24;google_apis;x86_64'
cat >> "$ANDROID_AVD_HOME/hukang-api24.avd/config.ini" <<'AVD'
hw.ramSize=4096
vm.heapSize=512
hw.keyboard=yes
hw.gpu.enabled=no
showDeviceFrame=no
disk.dataPartition.size=6G
AVD
"$ANDROID_HOME/emulator/emulator" -avd hukang-api24 -port 5554 -no-window -gpu off -noaudio -no-snapshot -no-boot-anim -feature -Vulkan > smoke-evidence/emulator-api24.log 2>&1 &
emulator_pid=$!
cleanup() {
  timeout -k 5s 15s adb logcat -d > smoke-evidence/emulator-api24-logcat.txt 2>&1 || true
  timeout -k 5s 10s adb emu kill || true
  kill "$emulator_pid" 2>/dev/null || true
}
trap cleanup EXIT
booted=false
boot_deadline=$(( $(date +%s) + 360 ))
for attempt in $(seq 1 180); do
  if ! kill -0 "$emulator_pid" 2>/dev/null; then cat smoke-evidence/emulator-api24.log; exit 1; fi
  if [ "$(timeout -k 2s 5s adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)" = 1 ]; then booted=true; break; fi
  if [ "$(date +%s)" -ge "$boot_deadline" ]; then break; fi
  sleep 2
done
if [ "$booted" != true ]; then echo 'Android 24 did not boot within the bounded wait.' >&2; exit 1; fi
timeout -k 15s 20m bash scripts/compare-android-ocr-ci.sh
