# Recognition audit — 2026-10-03

Scope: four primary tasks (barcode, nutrition, ingredients, production/expiry date).
Cloud build/installation success is not recognition acceptance. No signing keys or
Vision credentials are required or uploaded in this audit.

## Verified implementation and defects

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
