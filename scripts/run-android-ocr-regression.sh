#!/usr/bin/env bash
set -euo pipefail

# Execute the explicitly selected bundled engine. A result from another engine cannot pass.
engine="${1:-mlkit}"
case "$engine" in mlkit) suffix="";; paddle) suffix="-paddle";; *) echo "Invalid OCR engine: $engine" >&2; exit 1;; esac
result_name="ocr-regression${suffix}.json"
# The hidden entry point is enabled only in the standalone cloud Debug variant.
app_package='com.hukang.local.clouddebug'
run_id="ocr-${engine}-$(date +%s)-$$"
mkdir -p smoke-evidence
adb shell am force-stop "$app_package"
# Archive the prior result before polling; React may start after our first poll.
if adb shell run-as "$app_package" test -e "files/$result_name"; then
  adb shell run-as "$app_package" mv "files/$result_name" "files/ocr-regression.before-$run_id.json"
fi
adb shell am start -W -n "$app_package/com.hukang.local.MainActivity" --ez ocrBenchmark true \
  --es ocrRunId "$run_id" --es ocrEngine "$engine" \
  | tee "smoke-evidence/ocr-${engine}-launch.txt"
grep -q 'Status: ok' "smoke-evidence/ocr-${engine}-launch.txt"

adb shell dumpsys meminfo "$app_package" > "smoke-evidence/ocr-${engine}-memory-before.txt"
completed=false
for attempt in $(seq 1 300); do
  if adb shell run-as "$app_package" test -s "files/$result_name"; then
    completed=true
    break
  fi
  sleep 2
done
if [ "$completed" != true ]; then
  echo 'Real OCR regression did not produce its result within 600 seconds.' >&2
  exit 1
fi
adb exec-out run-as "$app_package" cat "files/$result_name" > "smoke-evidence/$result_name"
adb shell dumpsys meminfo "$app_package" > "smoke-evidence/ocr-${engine}-memory-after.txt"
node scripts/validate-ocr-run.mjs "smoke-evidence/$result_name" "$run_id" "$engine"
printf '%s\n' "$run_id" > "smoke-evidence/ocr-${engine}-run-id.txt"
node scripts/score-ocr-benchmark.mjs "smoke-evidence/$result_name" > "smoke-evidence/ocr-score${suffix}.json"
node scripts/check-ocr-regression.mjs "smoke-evidence/$result_name" "smoke-evidence/ocr-score${suffix}.json" "$engine"
# Diagnostic collection is secondary to the validated native JSON. A failed ADB
# log stream must not discard completed evidence or prevent the storage check.
if ! timeout 20s adb logcat -d -t 2000 > smoke-evidence/ocr-${engine}-logcat.txt 2> smoke-evidence/ocr-${engine}-logcat-error.txt; then
  echo 'OCR logcat collection failed; see ocr-logcat-error.txt.' >&2
fi
if ! timeout 20s adb exec-out screencap -p > smoke-evidence/ocr-${engine}-result.png 2> smoke-evidence/ocr-${engine}-screenshot-error.txt; then
  echo 'OCR screenshot collection failed; see ocr-screenshot-error.txt.' >&2
fi
