# Actual Android OCR execution records

`20261003-final-a49e85d.json`: final production-chain execution from [run 37114803456](https://github.com/chenchangxiang-330/Hukang-codex/actions/runs/37114803456), commit `a49e85d87c308ef513a7bd0cb09124ba43459a9c`. Same two JPEGs; same Chinese ML Kit. Production/merged: 7 correct, 0 wrongly populated, 3 unknown out of 10 visible core fields. Both bases correct; unsupported fields 0; Vision not run. `production.result` retains original/ROI native raw text, Parser inputs, independent candidates and confirmation state. These are pre-user-confirmation candidate results, not a human-verified saved food record.

`20261003-ab-b597405.json`: [run 37112218555](https://github.com/chenchangxiang-330/Hukang-codex/actions/runs/37112218555), commit `b5974053d899d224ee9ad00dcbd4278bb6f1c158`. After geometry/Parser fixes, original 7/1/2 and ROI 4/1/5 (correct/wrong/missing). Gray 5/0/5; upscaled 4/1/5; deskew only the tilted milk image 2/2/1 (5 fields, 50% dataset coverage). These image filters are not enabled by default: no stable A/B gain was established.

`20261003-baseline-ba77a7e.json` is the unmodified output retrieved from the Android 35 x86_64 emulator in GitHub Actions run [37101850839](https://github.com/chenchangxiang-330/Hukang-codex/actions/runs/37101850839), source commit `ba77a7e0303bb9507dbc296d6d88703a9c02efb2`.

The two existing licensed JPEGs were actually passed to bundled ML Kit Chinese 16.0.1. Native raw text, bounding boxes, confidence, durations, parser output and stage statuses are retained. No Vision credential was available: Vision is `not_run / CI_NO_VISION_KEY` and has no accuracy score.

The previous run `37096923317` failed to materialize bundled Android drawable assets as disk files. Its file-read errors are not a recognition accuracy baseline.

`real-ocr-replay.test.mjs` replays this archived native output through geometry and Parser. It does **not** rerun ML Kit and is not a new image accuracy measurement. Every image accuracy comparison requires a fresh Android execution record.
