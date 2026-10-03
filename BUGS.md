# HuKang V1.4 Known Bugs

更新日期：2026-10-03。本文区分用户真机复现、代码审查发现和尚未验证的风险。旧BUG-001/002/003的现象和构建记录保留作历史；用户最新反馈拍照和结果页已通，当前重点为BUG-009。

## P0

### BUG-009 — 中文食品营养标签识别不准确，Vision没有可验证增益

- 用户现象：拍照成功、可进入结果，但中文小字/数字单位错误，联网没有明显改善。
- A / OCR层：已确认中文bundled模型，不是Latin。旧代码无营养表ROI、先统一宽2400缩小、原生只返回整段text、丢弃行坐标/置信度。图像反光/模糊等仅为可能原因，尚无本次ML Kit真图raw输出，不能确定主要占比。
- B / Parser层：已用旧提交实际复现 `蛋白质\n脂肪3.6g` 被解析为蛋白3.6g；缺基准默认100g；`1,000mg` 变1mg；能量换算重复计字段使不完整结果被当足够。
- C / fallback层：旧质量阈值会先return，连OCR/Vision都不执行；旧本地完整度条件过宽；默认Key为空，联网开关不配置Key。手机当时的SecureStore和请求记录未获取，不能把这些静态路径当成那次唯一原因。
- D / Vision质量和使用层：没有真实响应证据，不知道模型效果。旧营养页把Vision结构再拼成文本，补默认基准、覆盖本地结果并重新解析，无冲突保留。
- 本轮代码：EXIF1–8直立化＋手动ROI/90°旋转；raw text/行框/行置信度；Parser保守解析、null与有限纠错；新营养链质量仅提示；食品专用Prompt直接传彩色图片；明确未配置/未发送/请求失败/低质量/融合使用；同基准逐字段融合、冲突和纠错由用户确认。
- 已验证：59项Node测试、TypeScript、Android JS导出通过；HTTP测试为mock且明确未调用真实服务。两张照片的人工转写Parser旧/新均10/10，不是OCR准确率提升。
- 2026-10-02补充：找到旧隐藏目录内已有JDK/SDK，使用其工具编译正式源码，原生Release Build、v2签名和对齐检查PASS；新APK为 `HuKang-V1.4-OCR-20261002.apk`。
- 2026-10-03补充：GitHub run37082741142已成功生成独立Debug APK，云端Android35模拟器下载、安装和离线启动PASS；不上传用户现有签名，不能因此关闭OCR问题。
- 未验证：手动裁剪触摸/方向真机效果、原图与处理图ML Kit、有效Key Vision、最终真实字段准确率。用户自己的手机尚未安装验证；本机ADB/SDK/JDK已按要求清理，无有效Vision Key。
- 状态：IMPLEMENTED IN CODE / P0 ACCEPTANCE STILL OPEN。不能标已修复完成。
- 范围：新流程仅接入营养模式；商品、配料、日期旧识别页面非本轮完整改造范围。

### 本轮风险与继续条件

- `createOcrVariant` 灰度/1.1对比度仅用于开发者对照，尚无实测收益；不默认叠加锐化、二值化、透视等。
- 基准含多个列、缺单位、歧义数字或破损中文名称时可能少报，需要用户确认，不能为提高表面完整度猜值。
- 0.75置信度阈值和行坐标横排规则尚未在食品集合校准，曲面/斜表可能触发更多兜底。
- 老APK不含新Native接口；必须重新原生Build后安装，不可只替换JS后声称已运行新链。
- 图片实验只2张/10字段；需扩展真实失败样本后再判断稳定性或是否迁移OCR框架。

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
