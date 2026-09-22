# HuKang V1.4 Test Report

更新日期：2026-09-22。只记录已经发生的测试；没有测试的项目明确标记为 NOT TESTED。

## Android Build

结果：**PASS**

- 最后构建时间：2026-09-21 23:09 +0800。
- Gradle：`BUILD SUCCESSFUL`，385 tasks。
- APK：`android/app/build/outputs/apk/release/app-release.apk`。
- 交付副本：项目父目录 `HuKang-V1.4.apk`。
- 版本：1.4.0 / versionCode 14。
- 包名：`com.hukang.local`。
- minSdk 24、targetSdk 36。
- ABI：arm64-v8a、armeabi-v7a。
- zipalign 检查：PASS。
- APK v2 签名检查：PASS。
- 签名：Android Debug certificate，仅供内测。
- SHA-256：`de69f77956574f5651870b594286d8700e55be2108e27c804daf21803c8c44d5`。

## TypeScript

结果：**PASS**

命令：`npm run typecheck`。`tsc --noEmit` 无错误。

## Automated Tests

结果：**PASS**

命令：`npm test`。18/18 通过。

覆盖：摄入/库存模型、存档解析、日期边界、条码规范化、候选评分、营养文字解析、配料解析、日期解析、添加糖 unknown 保持 null。

限制：这些是 Node 单元测试，不会调用 Android Camera、Kotlin OCR、真实 SQLite 文件、Vision API 或真机网络。

## ADB / Emulator Availability

结果：**NO DEVICE**

2026-09-21 执行 `adb devices -l`，列表为空。本机没有可用 AVD。因此当前 Codex 没有亲自安装最终 V1.4 APK 或运行 Android instrumentation 测试。

## App Launch

结果：**PASS（用户真机报告）**

用户能够进入扫一扫并操作相机。设备型号和 Android 版本没有记录。

## Camera Preview / Shutter

结果：**PARTIAL PASS（用户真机报告）**

- 相机预览可见。
- 快门可以触发，页面显示“正在准备照片…”。
- 拍照后的文件与导航链失败，见 Product Photo 和 Nutrition Label。

## Barcode Scan

结果：**DETECT PASS / PRODUCT LOOKUP NOT VERIFIED**

- 测试条码：`6930487920475`。
- 扫描检测：PASS，App 正确显示该数字。
- 本地查询：没有命中证据。
- 在线查询：结果页面显示“已经识别到条形码，但暂时没有找到对应商品”。没有当次 HTTP status/response 日志，无法判定请求是否成功返回无数据。

## Product Photo

结果：**FAIL（用户真机报告）**

测试：真实商品包装正面，具体商品名未记录。

实际：拍摄 → “正在准备照片…” → 数秒后恢复 Camera → 无识别结果。

没有取得当次扫描诊断事件、文件路径、文件大小、OCR 文本或 logcat。

## Nutrition Label

结果：**FAIL（用户真机报告）**

实际：拍摄 → “正在准备照片…” → 无识别结果。

没有取得 OCR raw text 或 parser 结果。

## Ingredients

结果：**NOT TESTED**

## Date / Expiry

结果：**NOT TESTED**

## Native OCR

结果：**NOT VERIFIED**

APK 内包含 ML Kit 中文模型和 `HuKangOcr` 原生模块。没有 V1.4 真机成功 raw text 记录。

## Online Vision

结果：**NOT TESTED WITH VALID CONFIG**

请求代码已构建进 APK。没有证据显示真机 SecureStore 中配置过有效 Endpoint/Model/API Key，也没有成功的 `VISION_RESPONSE_RECEIVED` 记录。

## Product Search

结果：**PARTIAL / APP END-TO-END NOT VERIFIED**

开发期间在 Mac 直接请求 Open Food Facts：

- v2 结构化品牌查询曾返回候选。
- 中文全文查询曾返回 0 个结果。
- 一次 legacy 请求曾返回 HTTP 503。

App 内“拍商品 → 搜索 → 候选”没有成功记录。

## SQLite Product Cache

结果：**NOT TESTED ON DEVICE**

没有“保存未知条码商品 → 强制结束 App → 断网重启 → 再扫同码本地命中”的真机记录。

## Intake / Inventory / Notifications

结果：**NOT TESTED ON V1.4 DEVICE**

代码和 Node 单元测试存在，但没有本次 Android 真机验证记录。

## Android Back

结果：**NOT VERIFIED**

`App.tsx` 已实现手工栈和 `BackHandler`。V1.4 没有真机逐级返回记录。

## Offline Mode

结果：**NOT TESTED END-TO-END**

没有飞行模式下完整执行历史、库存、本地条码、摄入和缓存重扫的 V1.4 真机记录。
