# Recognition audit — 2026-10-03

Scope: four primary tasks (barcode, nutrition, ingredients, production/expiry date).
Cloud build/installation success is not recognition acceptance. No signing keys or
Vision credentials are required or uploaded in this audit.

## Verified old-chain implementation and defects (before this iteration)

| Layer | Evidence | Finding |
| --- | --- | --- |
| Camera / files | `ScannerV14.tsx`, `scanning.ts` | Real camera capture and awaited file copy; file existence/size checked. Gallery uses the same stable-image pipeline. |
| Orientation | `HuKangOcrModule.kt`, `imagePreprocessing.ts` | Native EXIF orientations 1–8, including mirrored orientations, normalized to upright pixels. Memory sampling can reduce resolution before crop. |
| Region / processing | `ImageCropper.tsx`, native module | Nutrition has manual region selection; other text tasks previously read whole photos. Grayscale/contrast is experimental, not demonstrated improvement. |
| OCR engine | `android/app/build.gradle`, native recognizer | Bundled `com.google.mlkit:text-recognition-chinese:16.0.1`, `ChineseTextRecognizerOptions`; not Latin-only. Raw text, geometry, confidence and duration available. |
| Quality gate | `RecognitionScreen.tsx`, `ProductRecognitionScreen.tsx` | Uncalibrated brightness/glare/blur flags stop OCR and Vision before either runs. Nutrition already treats them as advisory. |
| Nutrition parser | `parser.ts` | Missing saturated/trans fats and failures for readable bracket-unit, split-digit/label formats. Structural completeness is not image OCR confidence. Never restore missing decimal points by guessing. |
| Ingredients parser | `parser.ts`, save paths | Comma splitting breaks nested compound ingredients; wraps split words; unrelated packaging sections become ingredients. |
| Date parser | `parser.ts`, result confirmation | Last date is incorrectly used as expiry, even when explicitly production or batch date. Shelf-life units and month-end overflow require correction. |
| Barcode | Expo `onBarcodeScanned`, lookup service | Real EAN/UPC scanner, local lookup then HTTP lookup exists. Different failure categories are lost in UI. OFF 404/not-found incorrectly classified as API error. |
| Product search | `productSearch.ts` | Caught requests are followed by `network: online`, even if every request failed. Empty OCR clues can prevent an available barcode query. |
| Vision | `visionRequest.ts`, `visionProtocol.ts` | Real POST includes original/upright-cropped JPEG as Base64 `image_url`, high detail. Default Key empty; UI switch does not configure a provider. No real Key means no successful Vision verification. |
| Result use | merge / legacy text screen | Nutrition preserves local/remote conflicts. Ingredients/date overwrite OCR raw text with Vision text and lose evidence/roles. |

## Actual public HTTP observations (not Vision)

Read-only requests on 2026-10-03; no photos or credentials sent:

- `6930487920475`: OFF HTTP 404, `status:0`, product not found, 1295 ms.
- `6923644266066`: HTTP 200, `status:1`, milk/brand/250 ml and core fields, 1261 ms.
- `6937003117814`: HTTP 200, `status:1`, missing name/brand; nutrients disagree with the photo, 1299 ms. Database carbohydrate/saturated-fat values of 112 g are not safe automatic fills.
- Text search for 特仑苏 纯牛奶 250ml: HTTP 200, count 0, 1002 ms.
- Brand query 特仑苏: HTTP 503, HTML response, 953 ms.

These distinguish actual requests, database coverage, invalid records and server
errors. They do not certify Vision configuration, image upload or model quality.

## Recognition evidence plan

Reuse the two existing licensed real nutrition photos and manually checked truth:
`6923644266066.jpg` and `6937003117814.jpg`. Ground truth is used only by the scorer,
never as OCR/parser/Vision input. Run actual bundled Chinese ML Kit on Android,
record original, upright ROI, parser, local-only merge and experimental grayscale.
Vision explicitly remains `not_run: CI_NO_VISION_KEY`.

Commit the diagnostic harness before recognition changes, preserving a genuine
pre-change baseline. Compare five visible core numeric fields (10 total), with
missing/wrong fields, basis and unsupported claims separately. Two images cannot
establish broad accuracy for glare, curved packaging, ingredients or inkjet dates.
No real samples for those categories have yet been supplied.

## Primary references

- [ML Kit Chinese text recognition on Android](https://developers.google.com/ml-kit/vision/text-recognition/v2/android)
- [ML Kit barcode scanning on Android](https://developers.google.com/ml-kit/vision/barcode-scanning/android)
- [Expo camera](https://docs.expo.dev/versions/latest/sdk/camera/)
- [Open Food Facts API](https://openfoodfacts.github.io/openfoodfacts-server/api/)

The official OCR guidance recommends focused, well-resolved text; it does not
justify adding arbitrary contrast, threshold or sharpening filters without A/B
evidence. Framework replacement is deferred until actual recognizer output has
been evaluated.

## First improvement: actual evidence, not feature completion

The baseline uses commit `ba77a7e` / run `37101850839`; the final Android run is
`a49e85d87c308ef513a7bd0cb09124ba43459a9c` / `37114803456`. Both reuse exactly the
two photos above and actually execute bundled Chinese ML Kit. Raw results are in
`tests/fixtures/ocr/results/20261003-{baseline-ba77a7e,ab-b597405,final-a49e85d}.json`.
Final `production` calls the same `recognizeNutrition()` as the result screen.

| Stage, 10 core fields | Correct | Wrong | Missing | Field accuracy |
| --- | ---: | ---: | ---: | ---: |
| Old original + parser | 2 | 0 | 8 | 20% |
| Final original + parser | 7 | 1 | 2 | 70% |
| Old ROI / local merge | 1 | 0 | 9 | 10% |
| Final ROI + parser | 4 | 1 | 5 | 40% |
| Final production local evidence merge | 7 | 0 | 3 | 70% |

This is pre-confirmation candidate accuracy, not character accuracy or saved
records. There are no unsupported invisible-field claims and both bases are
correct. Milk still has three unknown values: ML Kit reads `36g`, `449`, `509`.
An explicit NRV inconsistency warns about `36g`; it never derives `3.6g`.
The other photo reads all five values on the original, but the ROI introduces
extra digits. Crop/context and JPEG re-encoding effects were not isolated.

Default geometry projection conservatively corrects tilted row grouping without
altering OCR glyphs/pixels. Original and cropped inputs stay independent; only
same-basis gaps can be supplemented. Conflicts and NRV-suspect values remain
unconfirmed. Changing a basis does not silently erase original/ROI conflicts.
Grayscale/contrast (5/10), 2x enlargement (4/10) and pixel deskew (2/5 on one
eligible photo) had no stable benefit and remain experimental, not defaults.

Ingredients/date now have focused manual selection, independent raw local/remote
evidence, ordered nested ingredients and explicit date roles. Packaging quality
flags are advisory rather than blocking recognition. Barcode retains the actual
scanner and local-then-HTTP lookup; failures/no record/invalid data are separate.
These logic changes have tests, but no corresponding real-image benchmark yet.

Public HTTP GETs were actually sent through the revised lookup module on the Mac;
they are not Android end-to-end barcode tests. Vision client construction and
failure categories are tested with mocks, but both real-image runs explicitly
record `not_run: CI_NO_VISION_KEY`. Provider image receipt, model quality and
Vision accuracy remain unverified. The user's prior phone configuration is not
known; the historical complaint cannot be reduced to a proved invalid Key.

114 automated tests, type checking, native Debug build and Android35 emulator
installation/standalone launch succeeded. User camera/gallery/crop/confirmation,
new data after restart, additional glare/curved/inkjet photos and valid-Key Vision
remain open. P0 is not closed. The original engine was already Chinese 16.0.1;
no OCR framework migration or native image-filter rewrite occurred this iteration.

## Changed files in this iteration

- Entry/confirmation: `App.tsx`, `src/{ScannerV14,RecognitionScreen,NutritionRecognitionScreen,TextRecognitionScreen,ProductRecognitionScreen,ProductConfirm,MineV13,ImageCropper}.tsx`.
- Image/OCR: `src/{imagePreprocessing,ocr,ocrGeometry,nutritionRecognition,localOcrEvidence}.ts`.
- Parsing/evidence/storage: `src/{parser,recognitionMerge,textLabelRecognition,textRecognitionEvidence,productClueEvidence,types,database}.ts`.
- Networking: `src/{productRequest,productOnlineLogic,productLookup,productLookupService,productSearch,vision,visionProtocol,visionRequest}.ts`.
- Real Android regression: `.github/workflows/android-apk.yml`, `android/app/src/main/java/com/hukang/local/MainActivity.kt`, `src/{OcrRegressionHarness.tsx,ocrBenchmark.ts}`, `scripts/{run-android-ocr-regression.sh,score-ocr-benchmark.mjs}`.
- Automated tests: `tests/{database-nutrients,label-parser-regression,local-ocr-evidence,nutrient-unknown-total,photo-pipeline,product-clue-evidence,product-network,real-ocr-replay,text-recognition-evidence,vision-request}.test.mjs`.
- Evidence/docs: the three JSON records and README files under `tests/fixtures/ocr/`, this audit, `ARCHITECTURE.md`, `BUGS.md`, `TEST_REPORT.md`, `HANDOFF.md`, `GITHUB_BUILD.md`.

See `TEST_REPORT.md` for the exact APK/source SHA, download, installation evidence
and test limitations. Existing source, signing files and older APKs are retained.
