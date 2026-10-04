#!/usr/bin/env bash
set -euo pipefail

# Run only against the isolated cloud Debug package, without clearing its data.
app_package='com.hukang.local.clouddebug'
run_id="storage-$(date +%s)-$$"
mkdir -p smoke-evidence

run_phase() {
  local phase="$1" completed=false
  adb shell am force-stop "$app_package"
  if adb shell pidof "$app_package" >/dev/null; then
    echo 'The previous app process is still running.' >&2
    exit 1
  fi
  if adb shell run-as "$app_package" test -e "files/storage-regression-$phase.json"; then
    adb shell run-as "$app_package" mv "files/storage-regression-$phase.json" "files/storage-regression-$phase.before-$run_id.json"
  fi
  adb shell am start -W -n "$app_package/com.hukang.local.MainActivity" \
    --es storagePhase "$phase" --es storageRunId "$run_id" | tee "smoke-evidence/storage-$phase-launch.txt"
  grep -q 'Status: ok' "smoke-evidence/storage-$phase-launch.txt"
  adb shell pidof "$app_package" > "smoke-evidence/storage-$phase-pid.txt"
  for attempt in $(seq 1 90); do
    if adb shell run-as "$app_package" test -s "files/storage-regression-$phase.json"; then
      completed=true
      break
    fi
    sleep 2
  done
  if [ "$completed" != true ]; then
    echo "Storage $phase did not complete within 180 seconds." >&2
    exit 1
  fi
  adb exec-out run-as "$app_package" cat "files/storage-regression-$phase.json" > "smoke-evidence/storage-$phase.json"
  node --input-type=module - "smoke-evidence/storage-$phase.json" "$run_id" "$phase" <<'JS'
import {readFileSync} from 'node:fs';
const [file,runId,phase]=process.argv.slice(2), result=JSON.parse(readFileSync(file,'utf8'));
if(result.status!=='completed'||result.phase!==phase||result.runId!==runId||!result.checks?.length||result.checks.some(check=>check.passed!==true))
  throw new Error(`Storage ${phase} failed or returned stale evidence: ${result.error??result.runId}`);
if(phase==='verify'&&(result.network?.isConnected!==false||result.launchToken===result.writeLaunchToken))
  throw new Error('Storage verification did not run offline in a fresh JS process');
console.log(`Storage ${phase}: ${result.checks.length} native checks passed (${runId}).`);
JS
  if ! timeout 20s adb logcat -d -t 2000 > "smoke-evidence/storage-$phase-logcat.txt" 2> "smoke-evidence/storage-$phase-logcat-error.txt"; then
    echo "Storage $phase logcat collection failed; see error artifact." >&2
  fi
  if ! timeout 20s adb exec-out screencap -p > "smoke-evidence/storage-$phase.png" 2> "smoke-evidence/storage-$phase-screenshot-error.txt"; then
    echo "Storage $phase screenshot collection failed; see error artifact." >&2
  fi
}

run_phase write
old_airplane=$(adb shell settings get global airplane_mode_on | tr -d '\r')
old_wifi=$(adb shell settings get global wifi_on | tr -d '\r')
old_data=$(adb shell settings get global mobile_data | tr -d '\r')
restore_network() {
  if [ "$old_airplane" = 1 ]; then adb shell cmd connectivity airplane-mode enable; else adb shell cmd connectivity airplane-mode disable; fi
  if [ "$old_wifi" = 1 ]; then adb shell svc wifi enable; else adb shell svc wifi disable; fi
  if [ "$old_data" = 1 ]; then adb shell svc data enable; else adb shell svc data disable; fi
}
trap restore_network EXIT
adb shell am force-stop "$app_package"
adb shell cmd connectivity airplane-mode enable
adb shell svc wifi disable
adb shell svc data disable
sleep 3
adb shell dumpsys connectivity > smoke-evidence/storage-offline-connectivity.txt
run_phase verify
