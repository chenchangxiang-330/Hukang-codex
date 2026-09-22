# HuKang V1.4 Known Bugs

更新日期：2026-09-22。本文区分用户真机复现、代码审查发现和尚未验证的风险。

## P0

### BUG-001 — 拍照后停在准备阶段并恢复相机

- 复现：扫一扫 → 拍商品或营养成分表 → 按快门。
- 实际结果：显示“正在准备照片…”，数秒后恢复相机，没有结果页。
- 期望结果：稳定保存照片并进入对应识别页面。
- 相关代码：`src/ScannerV14.tsx` 的 `capture()` / `finishPhoto()`，`src/scanning.ts` 的 `persistScanImage()`，`App.tsx` 的 `onCapture`。
- 已确认根因：`expo-file-system` 新 API 的 `File.copy()` 返回 Promise；原图和 work 图两处复制都没有 `await`，代码随即读取 `exists/size`，形成落盘竞态并抛出 `PHOTO_FILE_INVALID`。Scanner 随后把 `busy` 设为 false，而错误文案只在 `busy` 时显示，造成无提示恢复相机。
- 修复：两次复制都等待完成后再检查存在性与非零大小；补齐捕获、文件、OCR/Vision 输入、错误阶段/消息/堆栈和结果状态事件；照片处理失败改为明确 Alert。
- 自动验证：TypeScript PASS、Node 回归测试 PASS、Android Release Build PASS。
- 真机验证：2026-09-22 `adb devices -l` 仍为空；修复版尚未完成真实商品/营养表拍摄验证。
- 状态：FIX IMPLEMENTED / DEVICE VERIFICATION PENDING。

### BUG-002 — 拍商品识别链路未端到端工作

- 复现：扫一扫 → 拍商品 → 拍完整包装正面。
- 实际结果：没有商品识别线索、候选或手动确认结果。
- 期望结果：OCR/Vision 提取线索，自动搜索并展示候选；无候选时显示已识别字段。
- 相关代码：`src/ProductRecognitionScreen.tsx`、`src/vision.ts`、`src/productSearch.ts`、`src/ProductConfirm.tsx`。
- 当前判断：BUG-001 的代码修复已完成；OCR/Vision/搜索链路增加了关键事件和可见错误，但仍没有修复版真机成功证据。
- 是否已验证：用户真机 FAIL。
- 状态：DEVICE VERIFICATION PENDING。

## P1

### BUG-003 — 营养成分表拍照没有进入结果

- 复现：扫一扫 → 营养成分表 → 拍照。
- 实际结果：显示准备照片后恢复相机。
- 期望结果：显示原图、OCR 原文、结构化营养数据或具体错误。
- 相关代码：`src/ScannerV14.tsx`、`src/scanning.ts`、`src/RecognitionScreen.tsx`。
- 当前判断：与 BUG-001 共用的异步复制竞态已经修复；OCR 路径仍需真机确认 raw text 或明确错误。
- 是否已验证：用户真机 FAIL。
- 状态：DEVICE VERIFICATION PENDING。

### BUG-004 — OCR 原生异常被吞掉

- 复现：让 `HuKangOcr.recognize()` 因无效 URI、解码或 ML Kit 问题 reject。
- 实际结果：`ProductRecognitionScreen` 和 `RecognitionScreen` 使用空 `catch {}`，原始错误丢失；后续可能表现为无文字。
- 期望结果：诊断日志区分 `OCR_CALL_FAILED` 与 `OCR_NO_TEXT`。
- 相关代码：`src/ProductRecognitionScreen.tsx`、`src/RecognitionScreen.tsx`、`src/ocr.ts`、`HuKangOcrModule.kt`。
- 当前判断：代码审查已确认并修复；两个识别页面现在记录 `OCR_CALL_FAILED`、`ERROR_STAGE`、`ERROR_MESSAGE` 和 `STACK_TRACE`，并区分 `OCR_NO_TEXT`。
- 是否已验证：静态回归测试 PASS；没有真机错误栈。
- 状态：FIXED IN CODE / DEVICE VERIFICATION PENDING。

### BUG-005 — 开启联网增强但未配置 Key 时 Vision 静默跳过

- 复现：允许联网增强，不在隐藏开发模式填写 API Key，随后拍商品。
- 实际结果：`if(config.apiKey)` 不成立时没有 Vision 请求，也没有明确诊断事件。
- 期望结果：诊断中明确 `VISION_NOT_CONFIGURED`，普通 UI 继续提供本地结果或操作入口。
- 相关代码：`src/ProductRecognitionScreen.tsx`、`src/RecognitionScreen.tsx`、`src/vision.ts`。
- 当前判断：代码审查已确认并修复；Key 为空会记录 `VISION_NOT_CONFIGURED` 并显示明确提示，本地 OCR/搜索仍可继续。
- 是否已验证：静态确认；未在真机上走过允许联网但 Key 为空的分支。
- 状态：FIXED IN CODE / DEVICE VERIFICATION PENDING。

### BUG-006 — 搜索服务错误与离线状态使用同一提示

- 复现：设备有网络，但 Open Food Facts 超时或返回 5xx。
- 实际结果：UI 显示“当前网络不可用”。
- 期望结果：区分 offline、timeout、HTTP error 和 no match。
- 相关代码：`src/ProductRecognitionScreen.tsx`、`src/productSearch.ts`。
- 当前判断：`network === 'offline' || network === 'error'` 被合并。
- 是否已验证：代码审查已确认；真机未测。
- 状态：OPEN。

### BUG-008 — Android 返回手势缺少 V1.4 真机回归验证

- 复现：从商品详情、识别结果和 Scanner 逐级执行系统返回手势。
- 实际结果：当前版本没有真机记录；历史版本曾出现子页面直接退出。
- 期望结果：子页面逐级 pop，只有 tabs 根页面允许退出。
- 相关代码：`App.tsx` 的手工 stack 与 `BackHandler`。
- 当前判断：代码上已有处理，但行为 NOT VERIFIED。
- 是否已验证：否。
- 状态：INVESTIGATING。

## P2

### BUG-007 — 候选商品 variant/category 在确认草稿中丢失

- 复现：拍商品搜索返回带 variant/category 的在线候选，点击“就是这个”并保存。
- 实际结果：`candidateDraft()` 没有复制 `variant` 和 `category`，数据库可能保存 null。
- 期望结果：候选字段传入确认页并保存。
- 相关代码：`App.tsx` 的 `candidateDraft()`、`src/ProductConfirm.tsx`。
- 当前判断：代码审查已确认映射缺失。
- 是否已验证：未真机验证。
- 状态：OPEN。

## 其他未验证项

以下没有足够证据定义为已复现 Bug：配料表识别、日期识别、到期通知、SQLite 重启持久化、断网重扫、相机前后台恢复和图片方向处理。它们当前状态是 NOT TESTED，而不是 PASS。

## 2026-09-22 修复构建

- 基线提交：`3c415d9 chore: establish HuKang V1.4 source baseline`。
- 修复 APK：`HuKang-V1.4-P0-fix.apk`。
- SHA-256：`459144e91add0b59509e6ff997e0ae443d064028e1d99b5cf87d972cac2febde`。
- 包名/版本：`com.hukang.local`，1.4.0 / versionCode 14。
- 签名：APK Signature Scheme v2，Android Debug certificate（仅供内测）。
- 当前没有连接 Android 真机，因此不能把 Product Photo、Nutrition Label、Native OCR、Online Vision 标记为 PASS。
