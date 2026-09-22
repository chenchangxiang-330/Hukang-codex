# HuKang / 护康 Engineering Handoff

交接日期：2026-09-22  
当前应用版本：1.4.0（Android versionCode 14）

本文只描述当前代码、已经取得的测试证据和已知问题。代码存在不等于真机验收通过。

## 1. 项目简介

HuKang 是一个无账号、离线优先的 Android 食品营养、摄入记录和库存管理 App。当前处于 V1.4 内测开发阶段，最近一轮工作集中在扫描识别系统。

当前主要目标是跑通：相机拍照 → 稳定图片文件 → 图片质量检查 → 本地 OCR / 可选在线 Vision → 商品搜索或标签解析 → 结果页面 → SQLite 保存。

当前最重要的问题是：用户真机拍摄商品正面或营养成分表后，只看到“正在准备照片…”，数秒后回到相机，没有进入识别结果。该闭环尚未跑通。

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
- 18 项 Node 自动测试通过；这些测试覆盖规则和数据逻辑，不是 Android 真机测试。
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
疑似原因：`finishPhoto()` 已开始，但 `persistScanImage()` 或随后 `onCapture()` 未完成；缺少当次日志，准确位置 UNKNOWN。  
相关文件：`src/ScannerV14.tsx`、`src/scanning.ts`、`App.tsx`  
当前状态：OPEN

### BUG-002

标题：拍商品端到端识别闭环不可用  
严重级别：P0

复现步骤：进入拍商品，拍摄完整包装正面。  
实际结果：没有进入 OCR、Vision、搜索或候选结果。  
期望结果：至少展示识别线索或明确分层错误。  
疑似原因：受 BUG-001 阻断；后续 Vision 与搜索也尚未真机验证。  
相关文件：`src/ProductRecognitionScreen.tsx`、`src/vision.ts`、`src/productSearch.ts`  
当前状态：OPEN

### BUG-003

标题：营养成分表拍照后没有结果  
严重级别：P1

复现步骤：进入营养成分表并拍照。  
实际结果：准备照片后回到相机。  
期望结果：进入识别结果，至少显示 OCR 原文或对应失败原因。  
疑似原因：与 BUG-001 共用 capture/persist 链路。  
相关文件：`src/ScannerV14.tsx`、`src/scanning.ts`、`src/RecognitionScreen.tsx`  
当前状态：OPEN

### BUG-004

标题：OCR 异常被空 catch 吞掉  
严重级别：P1

复现步骤：让 `HuKangOcr.recognize()` 抛错。  
实际结果：错误被转成空文本，商品流程只记录文字长度，标签流程可能记录 `OCR_NO_TEXT`。  
期望结果：日志能区分 OCR 调用失败与识别结果为空。  
疑似原因：两处 `try { recognizeText } catch {}`。  
相关文件：`src/ProductRecognitionScreen.tsx`、`src/RecognitionScreen.tsx`  
当前状态：OPEN

### BUG-005

标题：联网增强开启但没有 API Key 时静默跳过 Vision  
严重级别：P1

复现步骤：允许联网增强，但不在隐藏开发模式配置 API Key，然后拍商品。  
实际结果：不会发 Vision 请求，普通 UI 不说明未配置。  
期望结果：诊断信息明确说明 Vision 未配置，普通流程仍给出可操作的本地结果。  
疑似原因：`if(config.apiKey)` 分支没有 else 日志。  
相关文件：`src/ProductRecognitionScreen.tsx`、`src/RecognitionScreen.tsx`、`src/vision.ts`  
当前状态：OPEN

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

最高优先级是用一台连接 ADB 的真机，逐层定位：

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

第一目标是让一张真实照片可靠进入结果页面，即使暂时只显示 OCR 原文或明确错误。随后才验证 Vision、联网候选和 SQLite 缓存。

## 16. Build

安装依赖与检查：

```bash
cd /Users/yangbing/.codex/.chatgpt-projects/g-p-6aa8fd4c70248191910c02f5e1e4ff04/hukang
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
export JAVA_HOME="$PWD/../.build-tools/java/Contents/Home"
export ANDROID_HOME="$PWD/../.build-tools/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export GRADLE_USER_HOME="$PWD/../.build-tools/gradle"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
export NODE_ENV=production
cd android
./gradlew assembleRelease
```

最后一次 release build：2026-09-21 23:09 +0800，`BUILD SUCCESSFUL`，385 tasks。  
原始产物：`android/app/build/outputs/apk/release/app-release.apk`  
交付 APK：项目父目录 `HuKang-V1.4.apk`  
SHA-256：`de69f77956574f5651870b594286d8700e55be2108e27c804daf21803c8c44d5`

APK 使用 v2 签名，签名证书是 Android Debug。包名 `com.hukang.local`，最低 API 24，目标 API 36，包含 `arm64-v8a` 和 `armeabi-v7a`。

## 17. 开发环境

最后实际使用环境：

- macOS / Darwin 27.0.0 arm64
- Node.js 24.20.0
- npm 11.19.0
- Java 17.0.20.1，Zulu 17 LTS
- Android SDK Platform 36
- Android Build Tools 36.0.0
- Android Platform Tools / ADB 37.0.1
- Gradle Wrapper 9.3.1
- Android NDK 27.1.12297006
- Kotlin 2.1.20（来自构建输出）
- compileSdk 36、targetSdk 36、minSdk 24
- ABI：armeabi-v7a、arm64-v8a

构建工具位于项目父目录 `.build-tools/`。不要重新安装或替换，除非现有路径失效。

## 18. 真机测试状态

测试设备：用户 Android 真机，型号和 Android 版本未记录。当前 Codex 环境执行 `adb devices -l` 时没有连接设备，也没有可用 AVD。

| 功能 | 状态 | 证据 |
|---|---|---|
| APK 安装 / App 启动 | PASS（用户侧） | 用户能进入扫描页并实际操作相机 |
| 相机预览 | PASS（用户侧） | 能看到相机并按快门 |
| Barcode Detect | PASS（用户侧） | 读出 `6930487920475` |
| Barcode Local Lookup | NOT VERIFIED | 没有保存过同码商品后的重扫记录 |
| Barcode Online Lookup | NOT VERIFIED | 样本显示未找到，没有当次 HTTP 日志 |
| Product Photo | FAIL（用户侧） | “正在准备照片…”后恢复相机，无结果 |
| Nutrition Label | FAIL（用户侧） | 同样没有结果页 |
| Ingredients | NOT TESTED | 无真机记录 |
| Date | NOT TESTED | 无真机记录 |
| Native OCR | NOT VERIFIED | 无成功 raw text 记录 |
| Online Vision | NOT VERIFIED | 无有效配置下的成功记录 |
| Candidate Confirmation / SQLite Cache | NOT TESTED | 无重启、断网、同码重扫记录 |
| Android Back | NOT VERIFIED | V1.4 未连接设备复测 |
| Offline Intake / Inventory | NOT TESTED for V1.4 | 只有代码和单元测试证据 |

## 19. 下一位开发者建议从哪里开始

1. 连接真机，确认 `adb devices -l` 能看到设备；安装当前 APK 或运行 development build。
2. 在“我的 → 关于护康”连续点击版本号 7 次，打开扫描诊断；清楚记录一次失败前后的 event 列表。
3. 重现拍商品失败，确认最后一个事件是 `PHOTO_CAPTURE_STARTED`、`PHOTO_CAPTURE_SUCCESS`、`FILE_EXISTS`、`FILE_SIZE`、`VISION_INPUT_READY` 中的哪一个。
4. 同时查看 logcat。若没有 `PHOTO_CAPTURE_SUCCESS`，检查 `takePictureAsync()`；若有成功但没有有效文件事件，检查 `File.copy()`；若有 `VISION_INPUT_READY` 但没有结果页，检查 `onCapture()` 和自定义 stack 更新。
5. 先让处理后的 `workUri` 在一个简单结果页面显示出来，再继续 OCR。不要同时改 Vision 或搜索。
6. 确认 `HuKangOcr.recognize(workUri)` 真正返回 raw text，并取消空 catch，记录 native error code。
7. OCR 稳定后配置一个有效 Provider，确认出现 `VISION_REQUEST_STARTED`、非零 `IMAGE_BYTES_LENGTH`、HTTP status 和 `VISION_RESPONSE_RECEIVED`。
8. 最后验证 `searchProducts()` 候选、`ProductConfirm` 保存、强制结束 App、断网重启、再次扫描本地命中。

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

`hukang/` 及其父目录当前不是 Git repository；`git status` 返回 `fatal: not a git repository`。因此没有 branch、最近 commit 或可列出的 tracked/modified/untracked 状态，也没有创建交接 commit。不要误以为 `.gitignore` 代表仓库已经初始化。

## 环境变量与密钥

项目代码当前不读取 `.env` 或 `process.env` 业务变量，所以没有创建 `.env.example`。Vision Endpoint、Model、API Key 由隐藏开发模式写入 SecureStore。源码中没有真实 API Key。构建时的 `JAVA_HOME`、`ANDROID_HOME`、`ANDROID_SDK_ROOT` 和 `GRADLE_USER_HOME` 是 shell 环境变量，不是 App `.env`。
