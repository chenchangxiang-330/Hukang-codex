# Actual Android OCR execution records

`20261003-baseline-ba77a7e.json` is the unmodified output retrieved from the Android 35 x86_64 emulator in GitHub Actions run [37101850839](https://github.com/chenchangxiang-330/Hukang-codex/actions/runs/37101850839), source commit `ba77a7e0303bb9507dbc296d6d88703a9c02efb2`.

The two existing licensed JPEGs were actually passed to bundled ML Kit Chinese 16.0.1. Native raw text, bounding boxes, confidence, durations, parser output and stage statuses are retained. No Vision credential was available: Vision is `not_run / CI_NO_VISION_KEY` and has no accuracy score.

The previous run `37096923317` failed to materialize bundled Android drawable assets as disk files. Its file-read errors are not a recognition accuracy baseline.

`real-ocr-replay.test.mjs` replays this archived native output through geometry and Parser. It does **not** rerun ML Kit and is not a new image accuracy measurement. Every image accuracy comparison requires a fresh Android execution record.
