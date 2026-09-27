# HuKang / 护康 Engineering Handoff

交接更新：2026-09-27（下方2026-09-22内容为历史记录）
当前应用版本：1.4.0（Android versionCode 14）

本文只描述当前代码、已经取得的测试证据和已知问题。代码存在不等于真机验收通过。

## 当前接续状态：中文营养标签准确率，尚未完成真机验收

- 用户最新反馈：拍照和结果页已可进入；当前P0是中文食品包装OCR读错、联网没有明显帮助，不再以旧“准备照片后返回相机”作为唯一现象。
- 本次恢复时，Git实际只有 `scanMetrics.ts` 和 `ocrGeometry.ts` 落盘。被额度中断的 `ocr.ts`、`scanning.ts`、预处理、Parser、Vision、原生改动均未生效；本轮重新小补丁实现并读回确认。上轮审核失败原因是额度不足无法完成审核，不是代码被判定有危险。
- 正式工程当前实际位置：`/Users/yangbing/Ai/open ai/我开发的app/护康/内测/2.0/HuKang`。上轮地址中的 `App/` 层已被外部移除；Git baseline `3c415d9` 和 `7077f1a` 仍在，不是新建工程。
- 核实引擎：bundled ML Kit Chinese 16.0.1 + ChineseTextRecognizerOptions，非Latin，无需首次联网下载中文模型。
- 默认预处理：EXIF1–8实际直立化、手动营养表选区/90°旋转、裁剪后尺寸限制、高质量彩色JPEG。灰度/对比度仅开发者A/B候选，没有证据前不默认启用；无自动透视/deskew/表格检测。
- 新营养链：NutritionRecognitionScreen → nutritionRecognition → ocr raw/geometry → strict parser → visionFallback/visionRequest → recognitionMerge → 用户逐字段与基准确认。自定义导航、SQLite和商品表单未重构。
- 原图/工作图、OCR原文、Parser输入输出、Vision是否发出/原响应/结构结果分开保留。缺基准不补100g，不从kJ生成“可见kcal”，不猜添加糖；纠错和冲突需确认。图片质量只作提示，不再拦住新营养链。
- 真图继续用上轮2张：`6923644266066`、`6937003117814`，共10核心字段。原图、人工真值、来源/CC BY-SA 3.0、固定ROI和SHA在 `tests/fixtures/ocr/`，没有重换样本。
- Developer Mode可看完整OCR原文、运行内置两图A/B并导出JSON；`node scripts/score-ocr-benchmark.mjs <export.json>` 分阶段评分。缺Key会标not_run，不是成功，也不是0%准确率。
- 当前检查：TypeScript PASS；Node 59/59 PASS；Expo Android JS/资源导出 PASS（含两张样本）。这些不等于Kotlin编译或APK构建。
- 当前阻塞：本机Java Runtime、Android SDK、ADB均不可用；`./gradlew assembleRelease` 在Java查找阶段失败。已新增手动触发的 `.github/workflows/android-apk.yml`，但正式源码尚无Git远端，GitHub Actions未运行；没有新版APK、设备logcat、真实OCR/预处理A/B或真实Vision执行。默认Key为空，用户尚不清楚设备Provider；不能断言手机曾调用了哪一模型。
- 人工正确转写 → Parser：旧 `7077f1a` 与新代码均10/10，仅证明B层正确文字的解析。真实图片原图/预处理/Vision/融合准确率都未测得，不能声称提高。
- 未上传源码、未触发云构建或费用；没有关联EAS项目/Git远程。GitHub APK工作流已准备，但需要关联仓库，并把现有 `android/app/debug.keystore` 的Base64内容安全存入仓库Secret `HUKANG_DEBUG_KEYSTORE_B64`。工作流会校验签名文件SHA-256，不匹配就拒绝构建，避免生成无法覆盖旧版的APK；密钥不能提交到Git。即便云构建成功也必须做Android设备测试。
- 本轮范围以营养链为主；商品、配料、日期旧页面仍有单独质量阻断/文本合并策略，不能宣称全扫描模式统一完成。

详细架构与官方/GitHub依据见 `ARCHITECTURE.md`；实测边界和继续步骤见 `TEST_REPORT.md`。下一位应先解决Android构建/设备及Vision凭证，再运行同批真实样本并评估，不要继续凭文本测试宣称准确率改善。

### 本轮修改文件清单

- Native：`android/app/build.gradle`、`android/app/src/main/java/com/hukang/local/HuKangOcrModule.kt`。
- 图片/OCR：`src/scanning.ts`、`src/imagePreprocessing.ts`、`src/ImageCropper.tsx`、`src/ocr.ts`、`src/ocrGeometry.ts`。
- 解析/融合：`src/parser.ts`、`src/recognitionMerge.ts`、`src/nutritionRecognition.ts`。
- Vision：`src/vision.ts`、`src/visionProtocol.ts`、`src/visionRequest.ts`、`src/visionFallback.ts`。
- 营养确认入口：`src/RecognitionScreen.tsx`、`src/NutritionRecognitionScreen.tsx`。
- 隐藏诊断：`src/scanMetrics.ts`、`src/MineV13.tsx`、`src/RecognitionDiagnostics.tsx`、`src/ocrBenchmark.ts`。
- 测试：`scripts/score-ocr-benchmark.mjs`、`tests/fixtures/ocr/` 两图与真值/许可说明、`tests/nutrition-quality.test.mjs`、`tests/nutrition-transcription.test.mjs`、`tests/ocr-benchmark.test.mjs`、`tests/ocr-geometry.test.mjs`、`tests/vision-request.test.mjs`、`tests/scan-logic.test.mjs`、`tests/scan.test.mjs`、`tsconfig.json`。
- 文档：`HANDOFF.md`、`BUGS.md`、`TEST_REPORT.md`、`ARCHITECTURE.md`、`README.md`。没有改App导航、数据库、首页、吉祥物或其他业务。

## 以下为2026-09-22历史记录

旧构建成功、旧设备列表以及旧现象不代表2026-09-27这批未构建代码已验收；冲突信息以本文件顶部当前状态为准。

## 1. 项目简介

HuKang 是一个无账号、离线优先的 Android 食品营养、摄入记录和库存管理 App。当前处于 V1.4 内测开发阶段，最近一轮工作集中在扫描识别系统。

当前主要目标是跑通：相机拍照 → 稳定图片文件 → 图片质量检查 → 本地 OCR / 可选在线 Vision → 商品搜索或标签解析 → 结果页面 → SQLite 保存。

当前最高优先级 P0 已完成代码修复和构建，但尚未完成修复版真机验收：旧 V1.4 APK 中，用户拍摄商品正面或营养成分表后只看到“正在准备照片…”，随后无提示恢复相机。

### 2026-09-22 P0 接手结论

- 根因已确认：`src/scanning.ts` 对原图和 work 图调用异步 `File.copy()` 时均缺少 `await`，随后立即读取 `exists/size`，导致落盘竞态并可能抛出 `PHOTO_FILE_INVALID`。
- 静默表现已确认：`ScannerV14` 捕获异常后把 `busy` 设为 false，而错误状态仅在 `busy` 时渲染，用户看不到失败原因。
- 两次复制现已等待完成，并分别验证 `exists` 和 `size > 0`。
- 新增 `PHOTO_CAPTURE_SUCCESS`、`PHOTO_URI`、`FILE_EXISTS`、`FILE_SIZE`、图片尺寸/EXIF、`IMAGE_PREPARE_SUCCESS`、`OCR_INPUT_READY`、`VISION_INPUT_READY`、`OCR_STARTED`、`OCR_TEXT_LENGTH`、`SEARCH_RESULT_COUNT`、`RESULT_STATE_UPDATED`、`RESULT_SCREEN_RENDERED`、错误阶段/消息/堆栈等事件。
- OCR 空 catch 已移除；照片、OCR、Vision 失败都有明确日志和用户提示。
- Vision API Key 为空时记录 `VISION_NOT_CONFIGURED`，并明确告知用户，不视为识别成功。
- `npm run typecheck` PASS；`npm test` 21/21 PASS；Android release 构建 PASS。
- 修复 APK：`HuKang-V1.4-P0-fix.apk`；SHA-256 `459144e91add0b59509e6ff997e0ae443d064028e1d99b5cf87d972cac2febde`。
- 2026-09-22 `adb devices -l` 无设备，商品实拍、营养表 OCR raw text、有效 Key Vision 和联网候选均为 NOT VERIFIED。

当时正式源码目录是：`/Users/yangbing/Ai/open ai/我开发的app/App/护康/内测/2.0/HuKang`，现已移动，当前目录见顶部。

工作期间上级目录被外部移动；原先确认的 `/Users/yangbing/Ai/我开发的app/App/护康/内测/2.0/HuKang` 已不存在。不要使用旧 `.codex/.chatgpt-projects/.../hukang`。

## 2. 技术栈

实际依赖来自 `package.json`：

| 领域 | 实际实现 |
|---|---|
| UI Runtime | React 19.2.3、React Native 0.86.3、Expo 57.0.24 |
| Language | TypeScript 6.0.3 |
| Navigation | 没有安装 React Navigation；`App.tsx` 使用 `useState<R[]>` 自建内存路由栈 |
| SQLite | `expo-sqlite` 57.0.3，数据库名 `hukang.db` |
| Camera / Barcode | `expo-camera` 57.0.5，`CameraView` 同时提供相机和条码回调 |
| OCR | Google ML Kit Chinese Text Recognition 16.0.1，通过 Kotlin 原生模块 `HuKangOcr` 调用 |
| Image Processing | `expo-image-manipulator` 57.0.19、`expo-file-system` 57.0.7、`expo-image-picker` 57.0.19 |
| Network | `@react-native-community/netinfo` 12.0.1 和原生 `fetch` |
| Online Product Data | Open Food Facts v2 商品接口、legacy 文本搜索接口 |
| Online Vision | 自定义 OpenAI-compatible Chat Completions Provider；图片以 base64 data URL 发送 |
| Notifications | `expo-notifications` 57.0.20 |
| Local Settings | AsyncStorage 2.2.0 |
| Secret Storage | `expo-secure-store` 57.0.4，用于设备端 Vision 配置 |
| Native Module | `HuKangOcrModule.kt`，提供 `recognize(uri)` 和 `inspectImage(uri)` |
| Other UI | `expo-blur`、`react-native-safe-area-context`、`expo-haptics`、`expo-audio` |

Android 使用 Hermes 和 React Native New Architecture。release 当前仍使用项目内 debug keystore 签名，只适合内测。

## 3. 项目目录结构

项目文件目前是扁平结构，没有 `screens/`、`services/`、`db/` 等分层目录。

```text
hukang/
├── App.tsx                         # 根组件、自定义导航、今日/库存和多个表单页面
├── index.ts                        # Expo/React Native 入口
├── package.json                    # JS 依赖与脚本
├── app.json                        # Expo 配置、包名、版本、权限插件
├── assets/                         # 图标、吉祥物、启动音频
├── src/
│   ├── ScannerV14.tsx              # 五入口扫描菜单、相机、条码、拍照
│   ├── ProductRecognitionScreen.tsx# 商品包装 OCR、Vision、候选搜索与结果 UI
│   ├── RecognitionScreen.tsx       # 营养表、配料表、日期识别结果
│   ├── ProductConfirm.tsx          # 在线候选确认并写入 SQLite
│   ├── MineV13.tsx                 # 设置、导出数据、隐藏扫描诊断和 Vision 配置
│   ├── scanning.ts                 # 照片复制、EXIF 旋转、压缩和稳定 URI
│   ├── ocr.ts                      # JS 到 HuKangOcr 原生模块的桥接
│   ├── vision.ts                   # OpenAI-compatible 图片理解 Provider
│   ├── productLookupService.ts     # 条码本地优先查询编排
│   ├── productLookup.ts            # Open Food Facts 单条码请求
│   ├── productSearch.ts            # 本地与 Open Food Facts 候选搜索
│   ├── productSearchLogic.ts       # 候选匹配分数
│   ├── barcode.ts                  # UPC/EAN 规范化
│   ├── parser.ts                   # 营养、配料和日期规则解析
│   ├── database.ts                 # SQLite 建表、迁移、CRUD 和种子数据
│   ├── preferences.ts              # 健康档案与扫描设置 AsyncStorage
│   ├── scanMetrics.ts              # 扫描统计和最近事件日志
│   ├── notifications.ts            # 本地到期通知
│   └── types.ts                    # 核心类型和日期/到期工具
├── tests/                          # Node 单元测试；不包含 Android instrumentation 测试
└── android/
    ├── app/build.gradle            # Android 配置、ML Kit 依赖、内测签名
    └── app/src/main/java/com/hukang/local/
        ├── HuKangOcrModule.kt      # OCR 和图片质量检查原生实现
        ├── HuKangOcrPackage.kt     # 手动注册原生模块
        ├── MainApplication.kt      # 将 HuKangOcrPackage 加入 RN package list
        └── MainActivity.kt         # Expo/React Native Activity
```

`android/` 包含手写原生模块。不要直接运行 `expo prebuild --clean`，否则必须重新核对并恢复上述 Kotlin 文件、ML Kit 依赖和手动注册。

## 4. 当前 Navigation 架构

项目没有 React Navigation。

```text
Root
├── 首次健康档案（profile.completed=false 时直接显示）
└── 自定义 route stack: R[]
    ├── tabs
    │   ├── 今日
    │   ├── 库存
    │   └── 我的
    ├── scan / barcode       -> ScannerV14
    ├── label                -> ProductRecognitionScreen 或 RecognitionScreen
    ├── confirm              -> ProductConfirm
    ├── products             -> 本地商品库
    ├── product              -> 商品详情
    ├── form                 -> 商品创建/编辑
    ├── addInv               -> 加入库存
    ├── inv                  -> 库存详情
    └── log                  -> 摄入编辑
```

`go()` 向数组追加页面，`back()` 删除最后一项，`home()` 重置为 `[{n:'tabs'}]`。Android `BackHandler` 在栈长度大于 1 时执行 `back()` 并消费事件；根 tabs 时返回 `false`，允许系统退出/后台化。

从代码看，子页面返回逻辑已有处理。V1.4 没有连接设备复测，因此 Android 返回手势当前状态是 **NOT VERIFIED**。成功保存商品时使用 `go(product)`，不是替换当前页，因此再返回会回到确认页或表单页，这是当前实际栈行为。

## 5. 数据模型

SQLite 只存在 3 张业务表；没有 SQLite `settings` 表。

### products

用途：商品主数据和扫描缓存。

主要字段：

- 标识：`id`
- 条码：`barcode`、`raw_barcode`、`normalized_barcode`
- 商品：`name`、`brand`、`variant`、`category`
- 规格：`net_content`、`net_content_unit`
- 营养基准：`nutrition_basis_amount`、`nutrition_basis_unit`
- 营养：`energy_kcal`、`energy_kj`、`protein_g`、`fat_g`、`carbohydrate_g`、`total_sugar_g`、`added_sugar_g`、`fiber_g`、`sodium_mg`
- 识别资料：`ingredients`、`ingredients_raw_text`、`ingredients_json`、`ocr_raw_text`、`image_uri`
- 来源：`data_source`、`last_verified_at`
- 时间：`created_at`、`updated_at`

`normalized_barcode` 有条件唯一索引。旧数据初始化时会补写规范化条码。

`carbohydrate_g`、`total_sugar_g`、`added_sugar_g` 是三个独立 nullable 字段。包装没有明确添加糖时，`added_sugar_g` 保存为 SQL `NULL`，不会根据碳水或总糖推算。

### inventory

用途：库存实例。

主要字段：`id`、`product_id`、`quantity`、`purchase_date`、`production_date`、`expiry_date`、`opened`、`opened_at`、`storage_type`、`photo_uri`。`product_id` 外键指向 `products`，商品删除时级联删除库存。

### nutrition_logs

用途：每日摄入快照。

主要字段：`id`、`product_id`、`date`、`time`、`amount`、`amount_unit`，以及完整营养字段。记录写入时会按摄入量计算并保存当时数值，随后修改商品不会改写历史快照。`product_id` 使用 `ON DELETE RESTRICT`。

### 非 SQLite 数据

- 健康档案：AsyncStorage `@hukang/profile/v1`
- 扫描设置：AsyncStorage `@hukang/scanner/v1`
- 扫描统计：AsyncStorage `@hukang/scan-metrics/v1`
- 最近扫描诊断：AsyncStorage `@hukang/scan-debug/v1`
- Vision Endpoint、Model、API Key：SecureStore `hukang.vision.config`
- 扫描图片：App documents 下的 `scans/`

## 6. 扫描系统真实架构

### 商品条形码

```text
ScannerV14 / CameraView.onBarcodeScanned
→ found(raw)
→ findProductByBarcode(raw)
→ normalizeBarcode()
→ DB.findBarcode()
→ 未命中时 lookupBarcode()
→ Open Food Facts /api/v2/product/{barcode}.json
→ 本地命中进入 product
→ 在线命中进入 ProductConfirm
→ 未命中留在 ScannerV14，显示条码已识别弹层
```

### 拍商品

```text
ScannerV14.capture()
→ CameraView.takePictureAsync()
→ ScannerV14.finishPhoto()
→ persistScanImage()
→ App.tsx onCapture() push label(product)
→ ProductRecognitionScreen
→ inspectImage()
→ HuKangOcr.recognize()
→ localClues()
→ 可选 OpenAICompatibleFoodVisionProvider.analyzeProduct()
→ searchProducts()
→ 本地 products / 条码查询 / Open Food Facts 文本或品牌查询
→ ProductCandidate[]
→ ProductConfirm
→ DB.saveProduct()
```

该链当前为 **NOT WORKING END-TO-END**。

### 营养成分表

```text
ScannerV14.capture()
→ persistScanImage()
→ App.tsx push label(nutrition)
→ RecognitionScreen
→ inspectImage()
→ HuKangOcr.recognize()
→ parseNutritionLabel()
→ 本地结果不足时可选 analyzeNutrition()
→ 用户确认
→ ProductForm
→ DB.saveProduct()
```

### 配料表

```text
ScannerV14.capture()
→ persistScanImage()
→ RecognitionScreen(requestedMode=ingredients)
→ inspectImage()
→ HuKangOcr.recognize()
→ parseIngredients() / findSugarKeywords()
→ 可选 analyzeIngredients()
→ ProductForm
→ DB.saveProduct()
```

### 生产日期 / 保质期

```text
ScannerV14.capture()
→ persistScanImage()
→ RecognitionScreen(requestedMode=date)
→ inspectImage()
→ HuKangOcr.recognize()
→ parseDates() / expiryFromText()
→ 可选 analyzeExpiry()
→ 本地商品列表 Products(expiry)
→ 用户选择商品
→ AddInventory
→ DB.addInventory()
```

日期识别不会直接创建库存；用户还必须选择已有商品并确认库存表单。

## 7. Camera / Capture

- 相机库：`expo-camera` 的 `CameraView`。
- 拍照函数：`ScannerV14.tsx` 中 `capture()`。
- 参数：`quality: 1`、`skipProcessing: true`、`exif: true`，后置摄像头，自动对焦开启。
- 相机临时 URI 传入 `persistScanImage()`。
- `scanning.ts` 立即复制到 `Paths.document/scans/{scanId}-original.jpg`。
- 读取 EXIF Orientation：3 → 180°，6 → 90°，8 → -90°。
- 宽度大于 2400 时缩放到 2400；输出 JPEG，压缩质量 0.95。
- 处理后的 `{scanId}-work.jpg` 是预览、OCR 和 Vision 的统一输入。
- 稳定文件会检查 `exists` 和 `size > 0`，并记录文件大小、尺寸和方向事件。

用户当前真机现象：

```text
拍商品或营养成分表
→ 按快门
→ 显示“正在准备照片…”
→ 数秒后恢复相机
→ 没有识别结果
```

“正在准备照片…”只在 `finishPhoto()` 开始时设置，说明 `takePictureAsync()` 很可能已经返回并进入 `finishPhoto()`。正常情况下，`persistScanImage()` 成功后会立即调用 `onCapture()` 并 push `label` 页面。根据当前 UI 现象，最值得检查的是 `persistScanImage()` 内的复制/渲染/二次复制，以及 `onCapture()` 是否实际执行。

没有取得该次真机的扫描诊断事件或 logcat，因此准确断点是 **UNKNOWN**，不能断言一定是文件复制失败。

## 8. Barcode

- 库：`expo-camera` 内置 barcode scanner。
- 类型：EAN-13、EAN-8、UPC-A、UPC-E、Code 128。
- 防抖：同一码 1.8 秒内不重复处理。
- 规范化：去空格、横线和非字母数字；处理 12 位 UPC 与前导 0 的 13 位 EAN 互换候选。
- 本地：`DB.findBarcode()` 查询 `normalized_barcode` 候选。
- 在线：`lookupBarcode()` 请求 `https://world.openfoodfacts.org/api/v2/product/{barcode}.json`，7 秒超时。
- 结果：本地命中进入详情；在线命中进入确认页；无结果显示已识别条码并提供拍包装或手动创建。

用户真机已经读出 `6930487920475`，所以相机条码检测本身有真实成功证据。该条码随后显示“已经识别到条形码，但暂时没有找到对应商品”。无法从现有证据判断是 Open Food Facts 无数据、网络失败还是接口错误。

在线函数真实存在。开发期间曾从 Mac 直接请求 Open Food Facts：结构化品牌查询返回过数据；一次中文全文查询返回 0；一次 legacy 请求返回 HTTP 503。没有保存 `6930487920475` 在 App 真机内的 HTTP 状态和响应，因此该样本的在线查询是 **NOT VERIFIED**。

## 9. OCR

OCR 使用 Google ML Kit Chinese Text Recognition 16.0.1，并打包进 Android APK。

```text
src/ocr.ts recognizeText(uri)
→ NativeModules.HuKangOcr.recognize(uri)
→ HuKangOcrModule.kt
→ InputImage.fromFilePath(context, Uri.parse(uri))
→ ChineseTextRecognizerOptions
→ 返回整段 result.text
→ parser.ts 规则解析
```

`inspectImage(uri)` 也在同一原生模块内实现，检查亮度、过曝占比、锐度和尺寸。

当前没有可证明 V1.4 真机 OCR 成功的记录。营养表拍照流程在结果页之前失败。配料和日期没有真机测试证据。

当 OCR 返回空字符串时，`RecognitionScreen` 会在诊断数据写入 `OCR_NO_TEXT`。但两处调用都使用空 `catch {}` 吞掉原生 OCR 异常，因此“原生模块抛错”和“成功运行但没有文字”在部分 UI 和日志中无法可靠区分。

## 10. Online Vision / AI

状态：**PARTIALLY IMPLEMENTED**。请求代码存在，端到端真机调用 **NOT VERIFIED**。

- Provider：`OpenAICompatibleFoodVisionProvider`
- 文件：`src/vision.ts`
- 默认 Endpoint：OpenAI-compatible `/v1/chat/completions`
- 默认 Model：`gpt-4.1-mini`
- 配置入口：我的 → 关于护康 → 连续点击版本号 7 次 → 开发者模式
- API Key：只保存在 SecureStore；源码中默认是空字符串，没有硬编码真实 Key
- 图片：`expo-file-system/legacy` 读取处理后 JPEG 为 base64，然后放入 `image_url.url = data:image/jpeg;base64,...`
- 超时：15 秒
- 响应：要求 JSON object，校验为 `StructuredResult`
- 商品字段：brand、product_name、variant、quantity、category、visible_text、barcode、uncertain_fields
- 标签字段：basis、nutrition、ingredients、dates、raw_text

首次联网会请求用户授权。授权和网络可用仍不足以触发 Vision；SecureStore 中还必须存在 API Key。未配置 Key 时当前代码静默跳过 Vision。

## 11. Product Search

真实实现只有两类数据源：

1. 本机 SQLite `products`
2. Open Food Facts

没有接入其他中国商品数据库，也没有通用网页搜索服务。

输入 `ProductSearchInput`：barcode、brand、productName、variant、quantity、keywords。输出 `ProductCandidate[]`，包含商品名、品牌、variant、规格、图片、条码、营养、配料、来源和内部 score。

顺序：

1. 条码本地精确匹配。
2. 本地商品字段打分；高匹配时直接返回最多 5 个。
3. 有条码时请求 Open Food Facts 单条码接口，命中即返回。
4. 组合品牌、名称、variant、规格和最多 4 个关键词，请求 legacy 文本搜索。
5. 无文本结果且有品牌时，请求 Open Food Facts v2 `brands_tags` 搜索。
6. 规范化、去重、按 score 排序，最多返回 5 个。

评分：条码 100、品牌 30、名称最高 40、variant 20、规格 10、关键词每项 3。没有实现图片向量或视觉相似度评分。

错误时返回本地候选并把 network 标记为 `offline` 或 `error`。UI 当前把两者都显示成“当前网络不可用”。

“拍商品 → 图片识别 → 联网搜索 → 候选 → 确认 → SQLite → 重启后本地重扫”是 **NOT WORKING END-TO-END**。

## 12. 当前已经真实跑通的功能

只列有证据的项目：

- Android release 构建成功，生成可解析、对齐并带 v2 签名的 APK。
- TypeScript `tsc --noEmit` 通过。
- 21 项 Node 自动测试通过；新增照片复制等待与 OCR 异常日志回归检查，这些仍不是 Android 真机测试。
- 用户真机能够安装/启动到 App 并进入扫描页，否则无法产生后述扫描现象。设备型号和 Android 版本未记录。
- 用户真机相机预览和快门能够启动。
- 用户真机成功检测条码 `6930487920475`。
- Mac 直接请求 Open Food Facts 的结构化品牌搜索曾返回候选数据。

没有证据证明 V1.4 的 SQLite 写入、摄入、库存、通知或离线重扫在 Android 真机完成过完整验收。

## 13. 当前没有跑通的功能

- 拍商品后没有进入商品识别结果。
- 营养成分表拍照后没有进入识别结果。
- 商品包装 Vision 没有真机成功记录。
- 商品包装 OCR 没有真机成功记录。
- App 内商品关键词联网搜索没有端到端成功记录。
- 候选确认后保存、重启、断网重扫闭环没有真机记录。
- 配料表识别：**NOT TESTED**。
- 日期识别和库存关联：**NOT TESTED**。
- 到期本地通知：V1.4 真机 **NOT TESTED**。
- Android Back：代码已实现，V1.4 真机 **NOT VERIFIED**。

## 14. Known Issues / Bugs

### BUG-001

标题：拍照后停在“正在准备照片…”并恢复相机  
严重级别：P0

复现步骤：

1. 进入扫一扫。
2. 选择拍商品或营养成分表。
3. 拍照。

实际结果：显示“正在准备照片…”，数秒后恢复相机，没有结果页。  
期望结果：稳定保存照片并进入对应识别页面。  
已确认原因：`persistScanImage()` 的两次异步 `File.copy()` 缺少 `await`，文件检查与复制发生竞态；捕获后错误状态又被隐藏。
相关文件：`src/ScannerV14.tsx`、`src/scanning.ts`、`App.tsx`  
当前状态：FIX IMPLEMENTED / DEVICE VERIFICATION PENDING

### BUG-002

标题：拍商品端到端识别闭环不可用  
严重级别：P0

复现步骤：进入拍商品，拍摄完整包装正面。  
实际结果：没有进入 OCR、Vision、搜索或候选结果。  
期望结果：至少展示识别线索或明确分层错误。  
当前判断：BUG-001 代码修复完成，OCR/Vision/搜索事件已补齐；修复 APK 尚未真机验证。
相关文件：`src/ProductRecognitionScreen.tsx`、`src/vision.ts`、`src/productSearch.ts`  
当前状态：DEVICE VERIFICATION PENDING

### BUG-003

标题：营养成分表拍照后没有结果  
严重级别：P1

复现步骤：进入营养成分表并拍照。  
实际结果：准备照片后回到相机。  
期望结果：进入识别结果，至少显示 OCR 原文或对应失败原因。  
当前判断：共用的 capture/persist 竞态已修复；仍需真机取得 OCR raw text 或明确错误。
相关文件：`src/ScannerV14.tsx`、`src/scanning.ts`、`src/RecognitionScreen.tsx`  
当前状态：DEVICE VERIFICATION PENDING

### BUG-004

标题：OCR 异常被空 catch 吞掉  
严重级别：P1

复现步骤：让 `HuKangOcr.recognize()` 抛错。  
实际结果：错误被转成空文本，商品流程只记录文字长度，标签流程可能记录 `OCR_NO_TEXT`。  
期望结果：日志能区分 OCR 调用失败与识别结果为空。  
修复：两处空 catch 已移除，记录 `OCR_CALL_FAILED`、错误阶段/消息/堆栈，并区分 `OCR_NO_TEXT`。
相关文件：`src/ProductRecognitionScreen.tsx`、`src/RecognitionScreen.tsx`  
当前状态：FIXED IN CODE / DEVICE VERIFICATION PENDING

### BUG-005

标题：联网增强开启但没有 API Key 时静默跳过 Vision  
严重级别：P1

复现步骤：允许联网增强，但不在隐藏开发模式配置 API Key，然后拍商品。  
旧版本结果：不会发 Vision 请求，普通 UI 不说明未配置。
期望结果：诊断信息明确说明 Vision 未配置，普通流程仍给出可操作的本地结果。  
修复：Key 为空时记录 `VISION_NOT_CONFIGURED` 并显示明确提示；本地流程继续。
相关文件：`src/ProductRecognitionScreen.tsx`、`src/RecognitionScreen.tsx`、`src/vision.ts`  
当前状态：FIXED IN CODE / DEVICE VERIFICATION PENDING

### BUG-006

标题：商品搜索服务器错误被显示为网络不可用  
严重级别：P1

复现步骤：网络连接正常但 Open Food Facts 返回 5xx 或超时。  
实际结果：`network === error` 与 `offline` 共用“当前网络不可用”。  
期望结果：区分离线、超时、服务错误和无候选。  
疑似原因：`setNetworkFailed(result.network==='offline'||result.network==='error')`。  
相关文件：`src/ProductRecognitionScreen.tsx`、`src/productSearch.ts`  
当前状态：OPEN

### BUG-007

标题：包装搜索候选的 variant/category 在确认草稿中丢失  
严重级别：P2

复现步骤：搜索结果返回 variant 或 category，点击“就是这个”。  
实际结果：`candidateDraft()` 没有复制这两个字段，确认保存可能写入 null。  
期望结果：确认页和 SQLite 保留候选字段。  
疑似原因：`App.tsx` 的 `candidateDraft()` 字段映射不完整。  
相关文件：`App.tsx`、`src/ProductConfirm.tsx`  
当前状态：OPEN，未真机验证

## 15. 当前最高优先级

先不要改首页、视觉、库存、营养功能或增加数据源。

最高优先级是用一台连接 ADB 的真机验证修复后的完整链路：

```text
Capture
→ Temporary URI
→ Original File
→ Manipulated Work File
→ onCapture Navigation
→ Image Inspection
→ OCR / Vision
→ Product Search
→ Result State
```

第一目标是确认商品包装能进入识别并显示视觉/本地结果或明确错误，同时确认营养表真正执行 OCR 并返回 raw text 或明确错误。随后才验证有效 Key Vision、联网候选和 SQLite 缓存。

## 16. Build

安装依赖与检查：

```bash
cd "/Users/yangbing/Ai/open ai/我开发的app/App/护康/内测/2.0/HuKang"
npm ci
npm run typecheck
npm test
```

运行连接设备上的开发构建：

```bash
npm run android
```

当前已有 `android/`，正常构建不需要 prebuild。若 Expo 配置变化必须同步原生工程，可运行：

```bash
npx expo prebuild --platform android
```

运行前先备份并在运行后核对 `HuKangOcrModule.kt`、`HuKangOcrPackage.kt`、`MainApplication.kt` 和 `android/app/build.gradle`。不要运行 `expo prebuild --clean`。

本机 release 构建命令：

```bash
cd android
env JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home \
  ANDROID_HOME=/Users/yangbing/Library/Android/sdk \
  ANDROID_SDK_ROOT=/Users/yangbing/Library/Android/sdk NODE_ENV=production \
  ./gradlew assembleRelease
```

最后一次 release build：2026-09-22，`BUILD SUCCESSFUL`，385 tasks。
原始产物：`android/app/build/outputs/apk/release/app-release.apk`  
交付 APK：正式源码根目录 `HuKang-V1.4-P0-fix.apk`
SHA-256：`459144e91add0b59509e6ff997e0ae443d064028e1d99b5cf87d972cac2febde`

APK 使用 v2 签名，签名证书是 Android Debug。包名 `com.hukang.local`，最低 API 24，目标 API 36，包含 `arm64-v8a` 和 `armeabi-v7a`。

## 17. 开发环境

最后实际使用环境：

- macOS / Darwin 27.0.0 arm64
- Node.js 24.20.0
- npm 11.19.0
- Java / Javac 17.0.20.1，Eclipse Temurin
- Android SDK Platform 36
- Android Build Tools 36.0.0
- Android Platform Tools / ADB 37.0.1
- Gradle Wrapper 9.3.1
- Android NDK 27.1.12297006
- Kotlin 2.1.20（来自构建输出）
- compileSdk 36、targetSdk 36、minSdk 24
- ABI：armeabi-v7a、arm64-v8a

没有全局 `gradle` 命令；使用项目自带 `android/gradlew`。Java 位于 `/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home`，Android SDK 位于 `/Users/yangbing/Library/Android/sdk`。不要重新安装或替换现有工具。

## 18. 真机测试状态

测试设备：用户 Android 真机，型号和 Android 版本未记录。当前 Codex 环境执行 `adb devices -l` 时没有连接设备，也没有可用 AVD。

| 功能 | 状态 | 证据 |
|---|---|---|
| APK 安装 / App 启动 | PASS（用户侧） | 用户能进入扫描页并实际操作相机 |
| 相机预览 | PASS（用户侧） | 能看到相机并按快门 |
| Barcode Detect | PASS（用户侧） | 读出 `6930487920475` |
| Barcode Local Lookup | NOT VERIFIED | 没有保存过同码商品后的重扫记录 |
| Barcode Online Lookup | NOT VERIFIED | 样本显示未找到，没有当次 HTTP 日志 |
| Product Photo | 旧 APK FAIL / 修复 APK NOT VERIFIED | 异步复制竞态已修复；无连接设备，未实拍 |
| Nutrition Label | 旧 APK FAIL / 修复 APK NOT VERIFIED | OCR 空 catch 已移除；无连接设备，未取得 raw text |
| Ingredients | NOT TESTED | 无真机记录 |
| Date | NOT TESTED | 无真机记录 |
| Native OCR | NOT VERIFIED | 无成功 raw text 记录 |
| Online Vision | NOT VERIFIED | 无有效配置下的成功记录 |
| Candidate Confirmation / SQLite Cache | NOT TESTED | 无重启、断网、同码重扫记录 |
| Android Back | NOT VERIFIED | V1.4 未连接设备复测 |
| Offline Intake / Inventory | NOT TESTED for V1.4 | 只有代码和单元测试证据 |

## 19. 下一位开发者建议从哪里开始

1. 连接真机，确认 `adb devices -l` 能看到设备；安装 `HuKang-V1.4-P0-fix.apk`。
2. 先清空 logcat，再拍一张真实商品包装。必须进入结果页，至少得到本地/视觉线索，或看到明确错误 Alert；保存隐藏诊断事件和 logcat。
3. 拍一张真实营养成分表。必须执行 `HuKangOcr.recognize(workUri)`，记录 raw text；若失败，记录明确 native error 和 `ERROR_STAGE`。
4. 确认事件顺序包含 `PHOTO_CAPTURE_SUCCESS → FILE_EXISTS/FILE_SIZE → IMAGE_PREPARE_SUCCESS → OCR_INPUT_READY/VISION_INPUT_READY → RESULT_SCREEN_RENDERED`。
5. 使用有效 Provider Key 验证 `VISION_REQUEST_STARTED`、非零 `IMAGE_BYTES_LENGTH`、HTTP status 和 `VISION_RESPONSE_RECEIVED`；Key 为空只验证 `VISION_NOT_CONFIGURED` 提示。
6. 验证 `searchProducts()` 候选、`ProductConfirm` 保存、强制结束 App、断网重启、再次扫描本地命中。
7. 只有上述实拍通过后，才能把 BUG-001/002/003 从 DEVICE VERIFICATION PENDING 改为 CLOSED。

## 20. 关键文件索引

| 任务 | 文件 |
|---|---|
| Root / 自定义 Navigation / 页面路由 | `App.tsx` |
| 扫描菜单、相机、快门、条码 | `src/ScannerV14.tsx` |
| 拍照文件稳定化与 EXIF | `src/scanning.ts` |
| OCR JS 桥接 | `src/ocr.ts` |
| OCR Android 原生实现 | `android/app/src/main/java/com/hukang/local/HuKangOcrModule.kt` |
| 原生模块注册 | `android/app/src/main/java/com/hukang/local/HuKangOcrPackage.kt`、`MainApplication.kt` |
| 商品包装识别页 | `src/ProductRecognitionScreen.tsx` |
| 营养/配料/日期识别页 | `src/RecognitionScreen.tsx` |
| Vision Provider | `src/vision.ts` |
| 商品条码查询编排 | `src/productLookupService.ts` |
| Open Food Facts 条码 API | `src/productLookup.ts` |
| 多候选搜索 | `src/productSearch.ts` |
| 候选评分 | `src/productSearchLogic.ts` |
| UPC/EAN 规范化 | `src/barcode.ts` |
| 营养/配料/日期 Parser | `src/parser.ts` |
| SQLite | `src/database.ts` |
| 核心数据类型 | `src/types.ts` |
| 扫描日志 | `src/scanMetrics.ts` |
| 扫描偏好 | `src/preferences.ts` |
| 隐藏开发诊断与 Provider 配置 | `src/MineV13.tsx` |
| 商品确认保存 | `src/ProductConfirm.tsx` |
| 通知 | `src/notifications.ts` |
| Android 依赖与签名 | `android/app/build.gradle` |

## Git 状态

正式源码目录已建立 Git 仓库，分支为 `main`。

V1.4 基线提交：`3c415d9 chore: establish HuKang V1.4 source baseline`。`android/` 和手写 ML Kit 模块已纳入版本控制；`node_modules`、Gradle/build 产物、APK、密钥和本机配置已忽略。

## 环境变量与密钥

项目代码当前不读取 `.env` 或 `process.env` 业务变量，所以没有创建 `.env.example`。Vision Endpoint、Model、API Key 由隐藏开发模式写入 SecureStore。源码中没有真实 API Key。构建时的 `JAVA_HOME`、`ANDROID_HOME`、`ANDROID_SDK_ROOT` 和 `GRADLE_USER_HOME` 是 shell 环境变量，不是 App `.env`。
