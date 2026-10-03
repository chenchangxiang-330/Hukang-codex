#!/usr/bin/env bash
set -euo pipefail

# This runs real bundled Chinese ML Kit, not a transcription fixture or a mocked OCR.
# The hidden entry point is enabled only in the standalone cloud Debug variant.
app_package='com.hukang.local.clouddebug'
mkdir -p smoke-evidence
adb shell am force-stop "$app_package"
adb shell am start -W -n "$app_package/com.hukang.local.MainActivity" --ez ocrBenchmark true \
  | tee smoke-evidence/ocr-launch.txt
grep -q 'Status: ok' smoke-evidence/ocr-launch.txt

completed=false
for attempt in $(seq 1 120); do
  if adb shell run-as "$app_package" test -s files/ocr-regression.json; then
    completed=true
    break
  fi
  sleep 2
done
adb logcat -d > smoke-evidence/ocr-logcat.txt
adb exec-out screencap -p > smoke-evidence/ocr-result.png
if [ "$completed" != true ]; then
  echo 'Real ML Kit regression did not produce its result within 240 seconds.' >&2
  exit 1
fi
adb exec-out run-as "$app_package" cat files/ocr-regression.json > smoke-evidence/ocr-regression.json
node scripts/score-ocr-benchmark.mjs smoke-evidence/ocr-regression.json > smoke-evidence/ocr-score.json
node --input-type=module -e '
  import {readFileSync} from "node:fs";
  const result=JSON.parse(readFileSync("smoke-evidence/ocr-regression.json","utf8"));
  if(result.runs?.length!==2) throw new Error("Expected both real nutrition images");
  for(const run of result.runs) {
    if(run.evidence!=="device_mlkit_image_execution") throw new Error("OCR evidence not from device");
    for(const stage of ["original","preprocessed"])
      if(run.stages[stage].status!=="ok" || !run.stages[stage].rawText)
        throw new Error(`${run.fixtureId}/${stage}: OCR did not return real text`);
    if(run.stages.vision.status!=="not_run" || run.stages.vision.reason!=="CI_NO_VISION_KEY")
      throw new Error("CI must not claim Vision execution without a real key");
  }
  console.log("Both real images executed through Chinese ML Kit; scores saved separately.");
'
