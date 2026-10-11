# Android local OCR attribution

`src/main/java/com/paddle/ocr/` contains selected Android SDK classes from
PaddlePaddle/PaddleOCR tag `v3.7.0`, `deploy/ppocr-android/ppocr-sdk`.
Copyright (c) 2026 PaddlePaddle Authors. All Rights Reserved.
Licensed under Apache License 2.0; the complete license is preserved in
`licenses/PaddleOCR-APACHE-2.0.txt`, and upstream headers remain in each file.

Source: https://github.com/PaddlePaddle/PaddleOCR/tree/v3.7.0/deploy/ppocr-android/ppocr-sdk

Hukang modifications:

- Fixed PP-OCRv5 mobile detector BGR/resize_long 960, thresholds 0.3/0.6,
  candidate limit 1000, unclip 1.5, quad output, no dilation.
- Recognizer keeps BGR and follows the fixed 48px-height reference resize,
  minimum tensor width 320, maximum 3200, normalized zero padding.
- Recognition output validates dictionary/class-count consistency and retains
  all decoder lines with score threshold 0, including low-confidence results.
- Monotonic Android clock replaces wall-clock timing in the adopted engine.
- Intermediate recognition native buffers are released deterministically.
- HuKang migration adds exceptional-path `finally` ownership release for detection
  normalization/scoring, perspective text crops and batch crop collection. Numeric
  thresholds, interpolation and decoder values are unchanged from the reference.
- ONNX Runtime telemetry is explicitly disabled before creating any session;
  initialization fails if that setting cannot be applied.
- The public SDK demo, UI, benchmark image, and network/download facilities are
  not included. The Expo module owns image import, EXIF 1–8 transforms,
  evidence, memory sampling and local-only error reporting.

Runtime dependencies (all FOREIGN_OFFLINE_LIBRARY):

- ONNX Runtime Android 1.21.1 — Microsoft, MIT license;
  https://github.com/microsoft/onnxruntime/tree/v1.21.1
- OpenCV 4.5.3.0 Android packaging — QuickBird Studios, BSD-3-Clause;
  OpenCV 4.5.3 core, Apache-2.0;
  https://github.com/QuickBirdEng/opencv-android/blob/master/LICENSE and
  https://github.com/opencv/opencv/tree/4.5.3
- AndroidX ExifInterface 1.4.2 — Apache-2.0; existing HuKang dependency retained;
  https://developer.android.com/jetpack/androidx/releases/exifinterface

Adopted from HuKang China commit `5af9d4a5e6cd3ee91e09e7adaf6921dfce696852`.
The HuKang React Native bridge is separate from the reference Expo module.
These inference libraries are used only on the device and contain no model
downloader or HTTP OCR client. Existing HuKang ML Kit and optional Vision paths
remain independent of this Paddle engine.

The complete Paddle/ONNX Runtime/OpenCV/QuickBird license texts and this notice
are also bundled as APK assets under `licenses/paddleocr/`.
