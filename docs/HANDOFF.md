# 护康 HuKang 接手报告

2026-10-04 接手后续：两处营养/商品编辑证据丢失已修复、低风险精简已完成，源码 `bb2dd46` 的新云构建、真实 OCR 和 Android API 离线冷启动回归通过。最新版本、APK 和验收边界以 [接手修复验证报告](./TAKEOVER_VALIDATION_20261004.md) 为准；[手机清单](./PHONE_ACCEPTANCE_20261004.md) 待用户执行。下文保留交接基线记录，BUG-009 仍 OPEN。

交接日期：2026-10-04（Asia/Shanghai）。本报告以实际源码、Git状态、原始测试记录和GitHub Actions日志为准。**识别P0仍未验收关闭；可构建、可安装、可启动不等于功能完成。**

本文是新的接续入口。根目录旧HANDOFF、TEST_REPORT、README下方保留历史记录：旧“需要上传签名Secret”“五个主入口”“尚无真实图片OCR”等说明不能覆盖本报告。

## 1. 项目目标与已确认约定

- 定位：无账号、离线优先的Android食品营养、摄入记录与库存管理App。健康档案保存在本机；不是医疗诊断工具。
- 阶段：V1.4内测，版本1.4.0 / Android versionCode 14；尚未商店发布。现有健康档案、今日/历史、商品、库存、摄入及设置代码已存在，但多数真实设备流程未验收。
- 当前唯一最高优先级：真实食品包装“获取照片 → 图片处理 → 中文OCR → 可靠解析 → 必要时联网 → 保留独立证据 → 用户确认 → 保存”真正可用。
- 四个主扫描入口必须分开：①商品码/条形码；②营养成分表；③配料表；④生产日期/保质期。商品包装识别保留为未知条码后的辅助路径，不是第五个主入口。
- 不做UI美化、首页重构、动画或其他新功能；环境迁移/清理暂停。用户尚未确认新版真机效果，**不得删除本地源码、旧APK或签名文件**。
- 开发/编译方式：GitHub源码 + 云端开发环境 + GitHub Actions Debug构建；这台Mac不再安装SDK/JDK/NDK/ADB。Node/npm/Git/gh/VS Code必须保留。
- 不上传任何用户现有签名私钥、keystore、API Key或个人数据。CI使用runner新生成的临时测试签名，不需要正式商店签名。
- 技术决策：保留既有原生Android工程、手写中文ML Kit和手动注册；禁止 `expo prebuild --clean`。不引入React Navigation，不新建工程。
- 数据决策：原始OCR文本不被Vision覆盖；不同来源/基准分开；冲突或看不清留空并确认。缺基准不默认100g；添加糖不由总糖/碳水推算；NRV只能提示矛盾，不能倒推营养值或小数点；未知营养不显示成0。
- 预处理需真实A/B证明。灰度/对比度、插值放大、像素deskew没有稳定收益，目前仅实验。未对PaddleOCR/RapidOCR/Tesseract实图比较，不能声称换框架能解决问题。

## 2. GitHub、分支与保存状态

| 项目 | 2026-10-04实际检查 |
| --- | --- |
| 仓库 | [chenchangxiang-330/Hukang-codex](https://github.com/chenchangxiang-330/Hukang-codex)，public |
| 当前开发分支 | `main`；远程检查只有此分支，未保护；本轮沿用main，不另建工程/分支、不强推 |
| 接手审计前HEAD | `cc5bba9db0f8d944931287e08fcc22cc9060d11a`，本地与远程一致 |
| 应用识别改进提交 | `a49e85d87c308ef513a7bd0cb09124ba43459a9c`；cc5bba9仅文档/测试证据，应用与构建代码未改变 |
| PR | GitHub查询所有状态返回空列表：本项目没有可提供的PR链接或合并状态；此前为直接push main |
| 本地未保存源码 | 交接开始时 `git status --porcelain=v1 --untracked-files=all`为空；无未提交、未推送或非忽略的未跟踪工作 |
| worktree | 本仓库仅一个本地worktree，无额外worktree待保存；本对话附件列表为空 |
| 源码独立恢复 | 新克隆审计前main（cc5bba9）的148个跟踪文件逐个核对存在性、文件字节、Git blob与执行位通过，无子模块/LFS属性遗漏 |
| GitHub权限 | CLI当前账号 `chenchangxiang-330`，仓库可读/写及ADMIN；Git协议HTTPS |
| 报告自身提交 | 本文与入口链接随main提交并正常push。自引用SHA无法预写在自身内容中；最终交付消息提供完整SHA，或用下方命令查询 |

当前唯一实际工作副本：

`/Users/yangbing/Ai/open ai/我开发的app/护康/内测/2.0/HuKang`

原先含 `App/` 的路径已经外部移动，不要在旧 `.codex/.chatgpt-projects/.../hukang` 开发。以GitHub main恢复为准，不依赖这台Mac的绝对路径。

```sh
git log -1 --format=%H -- docs/HANDOFF.md
gh api repos/chenchangxiang-330/Hukang-codex/branches/main --jq .commit.sha
git status --short --branch
```

### 云端未保存工作：已检查与无法检查的边界

- 已检查GitHub分支、PR及Actions运行：最新相关run已完成，无正在执行的该批次构建工作；Actions检出已提交源码，产物为APK与安装/OCR证据，不承担源码草稿保存。
- **无法直接审计其他顾问或Codex Cloud隐藏会话的文件系统。** 当前对话没有它们的挂载路径或导出材料。
- 额外尝试查询Codespaces，API返回403、缺少 `codespace` scope。未擅自刷新权限；不能把403解释为“云端没有工作区/没有未保存文件”。
- 这次可访问工作副本没有遗失草稿。若另有云端会话，需由其所有者先导出或提交未保存diff/未跟踪资源，再让接手者合并；不要在未检查时关掉该会话。
- 2026-10-04新克隆核对材料在 `/private/tmp/hukang-handoff-20261004.pu24PP`，仅临时检查副本，不是新的正式工程或永久备份。

### 必须保留但故意不提交的本地文件

以下是本轮在正式仓库中实际看到的Git忽略文件；没有删除或上传：

| 路径（相对于正式根） | 用途/恢复边界 |
| --- | --- |
| `android/app/debug.keystore` | 旧测试包签名；不能从GitHub克隆恢复，不公开内容 |
| `HuKang-V1.4-OCR-20261002.apk` | 旧可安装成品，约75MiB；不得删除 |
| `HuKang-V1.4-P0-fix.apk` | 历史修复成品，约73MiB；不得删除 |
| `HuKang-source-20261002.zip` | 旧纯源码快照，非最新识别提交 |
| `HuKang-source-20261002.bundle` | 已验证有效的旧完整Git历史，main截至2393bd1，不包含a49e85d/cc5bba9后续提交 |
| `node_modules/`、`.expo/`、`dist/`等 | 可按锁文件/构建重新生成，本轮不清理 |
| `.DS_Store` | macOS元数据，不是待上传源码 |

其他个人目录/旧APK/签名未作无差别扫描，不能声称已全部备份。APK、签名不属于“未保存源码”，但仍需独立保留；**不能说整个本地HuKang已经可以安全删除**。

## 3. 真实完成情况

状态严格限定验证范围；一项“自动测试通过”不代表整项真机验收通过。

| 功能/页面 | 状态 | 真实证据或缺口 | 关键文件/接口 |
| --- | --- | --- | --- |
| 独立Debug构建、安装、启动、首启档案页渲染 | 已完成并验证 | Android35模拟器安装Success、启动Status: ok、页面/进程检查；不是表单保存验收 | `.github/workflows/android-apk.yml`、`scripts/smoke-android-apk.sh`、`App.tsx` Profile |
| 健康档案建立/修改、目标多选 | 已实现但未验证 | 完整触摸操作、保存和重启未验收；当前营养目标是types.ts固定值，不是按档案计算 | `App.tsx` Profile、`src/preferences.ts`、`src/MineV13.tsx` |
| 今日/历史、摄入来源、预测、修改/删除 | 已实现但未验证 | 计算/未知值规则有自动测试；实际设备整套流程未验收 | `App.tsx` Today/ProductView/LogEdit、`src/database.ts`、`src/types.ts` |
| 本地商品搜索、手动建档/编辑 | 已实现但未验证 | 真实设备CRUD和持久化未验收 | `App.tsx` Products/ProductForm、`src/database.ts` |
| 库存、数量、生产/到期日、开封/删除 | 已实现但未验证 | 日期可留空；真实设备及到期通知未验收 | `App.tsx` Inventory/AddInventory/InventoryDetail、`src/notifications.ts` |
| 相机/图库 → 文件保存/尺寸/方向 → OCR输入 | 已实现但未验证 | 复制等待、非空检查、EXIF处理在代码和分支测试中；新版真实拍摄/前后台链未验收 | `src/ScannerV14.tsx`、`scanning.ts`、`imagePreprocessing.ts`、原生模块 |
| EAN/UPC真正条码扫描、本地优先、在线补查、确认缓存 | 已实现但未验证 | 用户旧版曾识别出码值；最新Mac实际GET及错误分支通过，但新版Android完整链未验收 | `ScannerV14.tsx`、`barcode.ts`、`productLookupService.ts`、`productLookup.ts`、`productRequest.ts` |
| bundled中文OCR引擎 | 已完成并验证（两图范围） | Chinese 16.0.1原生实际读取两张真实标签，非Latin；准确率仍不足 | `android/app/build.gradle`、`HuKangOcrModule.kt`、`src/ocr.ts` |
| 营养解析/原图与ROI融合 | 进行中 | 两图10字段：7正确/0错填/3缺失；牛奶三字段尚未解决，P0 OPEN | `NutritionRecognitionScreen.tsx`、`nutritionRecognition.ts`、`parser.ts`、`ocrGeometry.ts`、`localOcrEvidence.ts`、`recognitionMerge.ts` |
| 裁剪/旋转、基准及字段选择、确认入库 | 已实现但未验证 | 冲突和未知值规则有测试；真机触摸、选择、入库、重启未验收 | `src/ImageCropper.tsx`、营养确认页、`App.tsx` ProductForm |
| 配料OCR、顺序/括号/百分比解析、结果确认 | 已实现但未验证 | 文本规则回归通过，无真实配料照片准确率；不能认为可靠健康分析完成 | `TextRecognitionScreen.tsx`、`textLabelRecognition.ts`、`textRecognitionEvidence.ts`、`parser.ts` |
| 喷码日期、生产/到期/保质期/批次区分 | 已实现但未验证 | 日期规则测试通过，无真实喷码准确率；计算到期仅候选 | 同上、`App.tsx` Products/AddInventory |
| 商品包装文字 → 线索 → 商品候选 | 已实现但未验证 | 保留原文及身份冲突选择；无新版整套包装真机成功证据 | `ProductRecognitionScreen.tsx`、`productClueEvidence.ts`、`productSearch.ts`、`productSearchLogic.ts` |
| 图片Vision、食品分任务Prompt、分层错误、独立候选 | 已实现但未验证 | 无真实有效Key；mock证明请求构造，不证明服务收到图/模型准确 | `vision.ts`、`visionRequest.ts`、`visionProtocol.ts`、`visionFallback.ts` |
| SQLite营养新增列、旧库迁移、NULL语义 | 已完成并验证（自动SQL范围） | Node SQLite执行真实SQL通过；不等于expo-sqlite设备端重启保存 | `src/database.ts`、`tests/database-nutrients.test.mjs` |
| 开发者诊断/raw text/A-B/JSON | 已实现但未验证完整手动操作 | 自动Android harness已经真实执行；用户点击导出未验收 | `MineV13.tsx`、`RecognitionDiagnostics.tsx`、`scanMetrics.ts`、`ocrBenchmark.ts`、`OcrRegressionHarness.tsx` |
| JSON导出/清空、启动音效、到期通知 | 已实现但未验证 | 用户设备权限、触发和完整恢复流程未验收 | `MineV13.tsx`、`App.tsx`、`notifications.ts` |
| 广泛配料/喷码/条码真实图基准、自动透视/表格检测、OCR替代引擎比较 | 未开始（或仅研究） | 当前这些fixtures目录仅README；没有实际对比结果 | `tests/fixtures/ocr/{ingredients,date,product}/`、`ARCHITECTURE.md` |

### 识别链真实结构

```text
ScannerV14相机/图库
 → persistScanImage等待复制、检查存在/非零大小
 → 原生EXIF1–8直立化、内存有界解码
 → 营养/配料/日期手动选区及90°旋转
 → OCR原始文本/行框/耗时
 → 营养行几何重排 + 对应Parser
 → 原图/ROI独立证据；低质量时尝试Vision（须配置/同意/可联网）
 → 冲突和未知保留
 → 用户确认 → ProductForm/库存入口 → SQLite
```

条码不走OCR：`CameraView.onBarcodeScanned → 码值归一化 → 本地SQLite → 未命中自动OFF HTTP → 候选/明确失败 → 用户确认缓存`。

关键原生文件均在 `android/app/src/main/java/com/hukang/local/`：`HuKangOcrModule.kt`、`HuKangOcrPackage.kt`、`MainApplication.kt`、`MainActivity.kt`。Gradle依赖为中文bundled模型，初始化使用 `ChineseTextRecognizerOptions`，注册代码不可丢失。

## 4. 环境、运行与构建

### 当前版本

| 环境/技术 | 实际值 |
| --- | --- |
| 本机Node / npm | 24.20.0 / 11.19.0；路径`/usr/local/bin/node`、`/usr/local/bin/npm` |
| 本机Git / gh | 2.54.0 Apple Git-156 / 2.102.0；`/usr/bin/git`、`/usr/local/bin/gh` |
| VS Code | `/Applications/Visual Studio Code.app`仍存在；本轮未做编辑器交互测试 |
| Expo / RN / React / TypeScript | lockfile锁定57.0.24 / 0.86.3 / 19.2.3 / 6.0.3，lockfileVersion 3 |
| Gradle / AGP / Kotlin | 9.3.1 / 8.12.0 / 2.1.20 |
| min / compile / target SDK | 24 / 36 / 36 |
| Build Tools / NDK | 36.0.0 / 27.1.12297006 |
| CI构建 | Ubuntu24.04、Node24、Temurin JDK17 |
| CI模拟器 | Android API35、google_apis、x86_64 |
| 原生运行 | Hermes、RN New Architecture；导航是App.tsx内存栈，不是React Navigation |
| 数据 | SQLite `hukang.db`：products/inventory/nutrition_logs；AsyncStorage档案/偏好；SecureStore Vision配置 |

当前Mac没有实际Android/JDK工具链。`/usr/bin/java`、`/usr/bin/javac`是macOS占位程序，不代表可用JDK；不要为接续本项目恢复已删环境或失效shell变量。也不要重新安装Homebrew。

### 源码恢复与本机可运行检查

```sh
git clone https://github.com/chenchangxiang-330/Hukang-codex.git HuKang
cd HuKang
git switch main
npm ci
npm run typecheck
npm test
git diff --check
```

`npm ci`按锁文件恢复项目依赖，不复制旧node_modules。测试实际脚本为 `node --experimental-strip-types --test tests/*.test.mjs`；类型检查为 `tsc --noEmit`。

`npm start`仅启动Metro。接手者若另有完整原生开发环境，可用 `npm run android`运行普通开发包；当前Mac不要因此安装SDK/JDK。Expo Go不包含手写HuKangOcr，不能替代原生APK验证。独立Cloud Debug APK不依赖Metro，不是热更新开发容器。`npm run build:android`仅Expo JS/资源导出，不会生成APK。

### 推荐：GitHub Actions Debug构建

向main推送应用/原生/资源/测试/脚本变更自动触发；仅本文、根README/HANDOFF等文档变更不触发。也可手动执行：

```sh
gh workflow run android-apk.yml --repo chenchangxiang-330/Hukang-codex --ref main
gh run list --repo chenchangxiang-330/Hukang-codex --workflow android-apk.yml --branch main --limit 5
gh run watch RUN_ID --repo chenchangxiang-330/Hukang-codex --exit-status
gh run download RUN_ID --repo chenchangxiang-330/Hukang-codex --name HuKang-Cloud-Debug-APK --dir /absolute/apk-output
```

上面 `RUN_ID`及下载目录需换成实际值。工作流先安装依赖、类型/测试，再在runner生成临时签名。CI在 `android/` 实际执行：

```sh
NODE_ENV=production ./gradlew --no-daemon --max-workers=2 assembleDebug -PcloudDebugBuild=true -PreactNativeArchitectures=arm64-v8a,x86_64
```

APK输出 `android/app/build/outputs/apk/debug/app-debug.apk`，上传名称为 `HuKang-cloud-debug.apk`，另附BUILD_INFO和SHA256SUMS；产物保留30天。

Cloud Debug包名 `com.hukang.local.clouddebug`、版本后缀 `-clouddebug`，包含arm64-v8a真机和x86_64模拟器，不支持仅32位设备。可与旧 `com.hukang.local` 并存，旧数据不自动迁入。**不同云构建签名不同，不能保证覆盖旧云Debug；卸载会丢该测试包数据，必须先导出并由用户决定，不能自动卸载。**

在已有ADB的其他环境安装/启动：

```sh
adb install /absolute/apk-output/HuKang-cloud-debug.apk
adb shell am start -W -n com.hukang.local.clouddebug/com.hukang.local.MainActivity
```

当前不是正式Release/商店签名流程。release buildTypes仍引用旧debug signing；不要照抄历史README的assembleRelease为新云流程。`eas.json`和`npm run apk:cloud`保留，但EAS未在本轮采用/验证。

### 配置位置（不包含密钥值）

业务代码没有读取 `.env`或 `process.env`；不存在已经接入的 `VISION_API_KEY` 环境变量，勿虚构配置方案。

| 名称 | 实际配置位置/作用 |
| --- | --- |
| Vision endpoint/model/apiKey | App“我的 → 关于护康 → 连续点版本7次 → 开发者模式 → 在线Provider → 保存开发配置”；设备SecureStore键`hukang.vision.config`，实现`src/vision.ts` |
| 默认Endpoint/Model | 代码默认HTTPS OpenAI-compatible Chat Completions地址及`gpt-4.1-mini`；仅默认值，不证明账户可用、模型效果或成功调用。默认Key未配置 |
| onlineEnhancement/onlineConsentAsked/developerMode | AsyncStorage `@hukang/scanner/v1`；开关/授权与服务配置独立 |
| 健康档案 | AsyncStorage `@hukang/profile/v1`；`src/preferences.ts` |
| 诊断 | AsyncStorage `@hukang/scan-debug/v1`、`@hukang/scan-metrics/v1`；`src/scanMetrics.ts` |
| NODE_ENV | CI构建步骤设production，不写Mac全局shell |
| JAVA_HOME、ANDROID_HOME/ANDROID_SDK_ROOT | 由CI Java/SDK设置步骤提供；本机不需配置 |
| GRADLE_USER_HOME | Gradle缓存位置；不属于源码/业务配置 |
| Android SDK本地定位 | 仅其他原生环境可使用忽略的`android/local.properties`，不提交机器路径 |
| 签名 | 当前工作流不引用自定义签名Secret；runner临时产生测试keystore，私钥不上传/缓存 |

Vision只接受合法HTTPS兼容Endpoint；图片JPEG直接作为base64 `image_url`、high detail进入POST，45秒超时。必须有服务配置、授权和网络；“联网增强”开关不是有效Key。诊断不记录授权头、Key或图片base64，但OCR/返回文本可能含个人内容，分享前仍要检查。

实际外部接口：
- 条码：OFF `GET https://world.openfoodfacts.org/api/v2/product/<EAN>.json?fields=...`，7秒超时。
- 包装文字：OFF `/cgi/search.pl?...`，品牌补查 `/api/v2/search?...`，默认8秒。
- 图片Vision：设备保存的HTTPS兼容Endpoint，图片JSON POST；没有自建代理后端。
- 无已部署Web页面、自建API服务或商店版本。APK是可下载测试产物，不是永久部署URL。

## 5. 验证记录与可恢复证据

### 本次交接实际重查

2026-10-04重新执行 `npm test`：114/114 PASS；`npm run typecheck`、`git diff --check` PASS。Node提示TypeScript strip/模块类型警告，非测试失败；未为消警告改变模块配置。

GitHub纯净克隆cc5bba9的148文件存在且逐文件字节与提交相同、Git blob和执行位一致；含src/assets/tests/scripts/docs/design/research、lockfile及原生OCR/注册/Wrapper。首次检查大图片时Node默认输出缓冲不足，扩大只读缓冲后完整检查通过，不是源码损坏。

### 云端实测版本

| 源码/运行 | 实际结果 | 证据 |
| --- | --- | --- |
| cc5bba9 / [run37116498494](https://github.com/chenchangxiang-330/Hukang-codex/actions/runs/37116498494) | 两job SUCCESS；日志确认114测试、原生BUILD SUCCESSFUL、安装/启动、生产OCR守卫通过 | 2026-10-04实际查询状态并阅读日志，不仅看绿色状态 |
| a49e85d / [run37114803456](https://github.com/chenchangxiang-330/Hukang-codex/actions/runs/37114803456) | 两job SUCCESS；已下载APK并校验字节，安装启动截图人工查看，启动crash日志为空 | [TEST_REPORT](../TEST_REPORT.md)及三份原始JSON |
| ba77a7e / [run37101850839](https://github.com/chenchangxiang-330/Hukang-codex/actions/runs/37101850839) | 真实旧链原图/ROI基线 | `20261003-baseline-ba77a7e.json` |
| b597405 / [run37112218555](https://github.com/chenchangxiang-330/Hukang-codex/actions/runs/37112218555) | 真实增强A/B与Parser改进中间结果 | `20261003-ab-b597405.json` |
| 089eadf / run37096923317 | drawable素材无法变成可读取文件；失败，不是准确率基线 | 已修复素材下载落盘 |
| e44a966 / run37114541142 | 后续提交触发并发取消；不记成功 | 保留历史说明 |

交接审计前main（cc5bba9）对应最新云APK：[cc5bba9 artifact](https://github.com/chenchangxiang-330/Hukang-codex/actions/runs/37116498494/artifacts/11272370782)，尚未在本机下载/算hash。最终该run的[安装/OCR证据artifact](https://github.com/chenchangxiang-330/Hukang-codex/actions/runs/37116498494/artifacts/11271862942)。有效期至2026-11-02；没有将其当永久归档。本次交接仅改文档，不触发新构建，APK源码SHA不要写成本报告提交SHA。

已下载并核验的a49e85d APK：[artifact](https://github.com/chenchangxiang-330/Hukang-codex/actions/runs/37114803456/artifacts/11270849346)。

- 本机路径：`/Users/yangbing/Downloads/HuKang-OCR-Debug-20261003-a49e85d/HuKang-cloud-debug.apk`。
- 文件大小135335951 bytes；SHA256 `a3f58a26d239036a9e585094c189c4d77c8b2e3e58f5b3d98bf959d6ee441db1`。
- cc5bba9与a49e85d应用代码一致，但APK签名/构建字节不同，不可把此hash套到cc5bba9产物。
- SHA256SUMS内路径为runner的 `cloud-apk/HuKang-cloud-debug.apk`。扁平下载后校验文件报路径不存在不代表包损坏；按APK实际路径算hash并对照值。
- `/private/tmp/hukang-ocr-final-a49e85d`保存此前下载的完整安装/启动/OCR日志和截图；临时目录可能失效，长期raw JSON已在Git，云artifact有保留期限。

### 同批真实中文标签定量结果

两图来源/许可、SHA、固定人工ROI与人工真值见 [fixtures说明](../tests/fixtures/ocr/README.md)。图片为既有真实照片，不是生成fixture；CC BY-SA 3.0归属须保留。人工真值只评分，不输入OCR/Parser/Vision。

| 图片 | 基准 | 能量kJ | 蛋白g | 脂肪g | 碳水g | 钠mg |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 6923644266066.jpg（牛奶） | 每100mL | 309 | 3.6 | 4.4 | 5.0 | 58 |
| 6937003117814.jpg | 每100g | 2075 | 21.0 | 37.7 | 19.0 | 1248 |

| 阶段（共10核心字段） | 正确 | 错误 | 缺失 | 字段准确率 |
| --- | ---: | ---: | ---: | ---: |
| 旧原图OCR＋旧Parser | 2 | 0 | 8 | 20% |
| 最新原图OCR＋新Parser | 7 | 1 | 2 | 70% |
| 旧ROI/本地融合 | 1 | 0 | 9 | 10% |
| 最新ROI＋新Parser | 4 | 1 | 5 | 40% |
| 最新实际生产链原图＋ROI本地候选 | 7 | 0 | 3 | 70% |

两图基准正确，不可见字段额外断言0。牛奶最终2/5：蛋白、脂肪、碳水无法可靠读取而留空；第二图5/5。裁剪/重编码后第二图多读数字，不能宣称裁剪必然改善，也未隔离压缩与上下文的影响。

灰度/温和对比度5/10，2倍放大4/10；像素deskew只运行可靠倾斜的一图2/5，另一图未运行。没有稳定收益，不默认启用。默认的“阅读行几何投影”只重排原生行，不修改像素、字符或bbox。

这是用户确认前的本地候选，不是已保存结果、字符正确率或总体包装准确率。Vision两图均为 `not_run / CI_NO_VISION_KEY`、准确率null，没有实际联网Vision增益。

已提交原始记录：
- `tests/fixtures/ocr/results/20261003-baseline-ba77a7e.json`
- `tests/fixtures/ocr/results/20261003-ab-b597405.json`
- `tests/fixtures/ocr/results/20261003-final-a49e85d.json`

复算（不是重跑图片OCR）：

```sh
node scripts/score-ocr-benchmark.mjs tests/fixtures/ocr/results/20261003-final-a49e85d.json
```

在已有ADB/测试包的干净Android环境真实重跑：

```sh
bash scripts/run-android-ocr-regression.sh
```

**重复运行风险：** 当前脚本没有删除旧 `files/ocr-regression.json`或校验生成时间。同一设备重复运行可能读到旧文件。干净CI模拟器的记录有效；接手者须使用新测试环境或先核对新记录时间/运行标识，不能把“文件已存在”当本次执行完成。该风险本轮只记录，未改脚本。

### 网络与手动验证边界

- 修复后的公开商品查询模块在Mac真实GET：6930487920475返回404/status0/无记录；6923644266066返回200/牛奶资料；6937003117814返回200但名称缺失及112g异常营养，过滤/标不完整。历史中文搜索0结果、品牌503也有记录。数据库覆盖差/异常数据不是OCR问题。
- Vision mock验证真实JPEG进入客户端请求、高detail、分任务Prompt及鉴权/HTTP/网络/结构错误；候选冲突有规则测试，不代表用户授权弹窗或点击确认已动态验收。**没有真实有效Key，不证明服务收到图片、模型效果或用户此前手机失败原因。**
- 人工查看过a49e85d Android模拟器启动截图；云自动执行实际中文ML Kit及生产识别链。
- 用户此前真机反馈：拍照与结果页能进入，但营养/配料错字、包装无有效结果、条码未知、联网无明显效果。设备型号/Android版本及当时配置未知。
- 尚未手动验收新版：手机相机/图库/裁剪触摸/旋转、四类识别、确认/入库/重启、离线缓存重扫、返回手势、通知、真实反光/曲面/喷码/配料、有效Key Vision。
- `tests/real-ocr-replay.test.mjs`是原始文本回放；人工正确转写测试旧Parser也能10/10，不能作为识图提升。Node SQLite测试不是AndroidSQLite持久化验证。

## 6. 已知问题、复现与优先级

| 优先级/问题 | 复现与真实影响 | 当前状态/下一步 |
| --- | --- | --- |
| P0 BUG-009：小数点/中文包装识别不可靠 | 两图真实A/B；牛奶3.6→36g、4.4→449、5.0→509；最终缺3字段，配料质量影响后续分析 | OPEN；改善图像/真实识别，而非Parser猜值；新增失败图及有效Vision对照 |
| P0：Vision无真实效果证据 | 默认未配置服务；开关不等于Key。用户旧手机请求/响应未知 | 客户端实现/分支已测，真实服务未测；必须区分未配置、未发送、请求失败、返回差、结果未正确使用 |
| P1：条码数据覆盖/网络异常 | 扫6930487920475公开库没有记录；其他资料有错误，不能统称“不认识食品” | 分类/异常过滤代码与HTTP证据已有；真机缓存重扫/超时/离线UI待测 |
| P1 BUG-001/003历史静默回相机 | 旧APK快门→准备照片→无提示返回；复制未await和错误显示条件曾出错 | 代码修复+可见错误，最新真实相机仍待闭环；不能因harness成功关闭 |
| P1：配料/喷码缺实图回归 | 小字/曲面/反光、嵌套配料、批次/生产混淆 | 文本规则有测试，真实图未验证；不能给可靠健康分析或把批次作有效期 |
| P1 BUG-008：Android返回手势 | 从结果、详情、扫描逐级返回 | BackHandler实现存在；新版真机逐级pop/根退出未验收 |
| P1：诊断脚本可能读旧结果 | 在同一测试设备反复跑脚本，先前JSON仍在 | 本轮发现未修改；需运行ID/时间验证或受控清旧输出，保留以前证据 |
| P2 BUG-007：候选variant/category草稿丢失 | 在线候选→确认→保存，App.candidateDraft未复制这两字段 | 实码仍缺映射，OPEN；不要在本次交接擅自混入修复 |
| P1验收缺口：持久化/通知/权限 | 新增/确认→杀进程→断网重启；通知拒绝/允许及前后台 | 代码和部分规则测试不代替真实设备测试 |

详细历史见 [BUGS.md](../BUGS.md)。不能把低置信度阈值或模型自评分当作实际正确率。

### 接手最先做的三件事及验收标准

1. **用已核验测试APK闭环用户真机失败链。** 记录设备型号/Android版本/APK源码SHA，用同一照片依次测试相机、图库、裁剪和四入口；导出raw OCR及阶段事件。验收：每次有识别原文/结果或明确错误，不再静默返回；未知数值/日期留空、冲突需确认；确认后入库、杀进程、离线重启数据一致。
2. **由用户选择并授权有效Vision服务，只在设备安全存储配置密钥。** 先用已有两图及用户失败图检查实际请求、响应、图片内容与结构输出；禁止把Key发聊天/提交Git。验收：明确Provider/Model/请求时间和图片字节、可审查响应；区别未配置/未发送/网络/鉴权/超时/低质量；独立记录Vision及融合字段正确/错误/缺失，不覆盖原文或猜添加糖。
3. **扩展真实食品Benchmark，先解决牛奶三个字段。** 保存真实照片/许可或用户分享授权、人工真值、方向/ROI、原图/处理图/raw/Parser/Vision/融合及错误字段；分离压缩与裁剪，保留有实际增益的处理。验收：既有两图守住至少7/10正确、0错填、0补造、基准正确，牛奶三字段须能得到正确可确认候选或明确不可读；新增各类图分别定量，不用人工转写/回放替代识图。若比较替代引擎，先跑同图再决策，不无证据迁移。

## 7. 接手者容易踩坑的背景

- 用户最新P0不是“完全拍不了”，而是“能进结果但识别不可靠”；旧静默问题的历史记录不要误当当前唯一目标。
- 当前70%只覆盖两张营养图；配料、喷码、条码广泛识别及真实手机效果未验收，不能宣布全面完成。
- OCR、Parser、fallback、Provider质量和结果使用必须分层。原图OCR可读而Parser漏单位与OCR丢小数点是不同问题；公开数据库结果不一致又是第三类问题。
- 同一中文引擎原图/ROI一致可能一起错，不提高独立可信度。基准变化不能隐藏原图/ROI数值冲突。
- 默认JPG高质量、EXIF方向、手动ROI是当前策略；阅读几何修正不是像素deskew。质量提示不应阻断OCR/Vision。
- 导航内存栈、SQL照片路径、原生接口都是现有约定。App末尾旧Mine及src/model.ts/storage.ts不是当前主业务路径；实际我的页是MineV13。
- 营养目标现在为types.ts固定值，不能宣传个性化计算已完成。
- 旧debug签名/旧APK/源码恢复包只是本地保留物；不得上传、删除，或把旧bundle当最新恢复材料。
- 仓库里的docs/design/research包含规划资料，不等于功能已实现；README旧五入口/Release说明以本文为准。
- 调用者先核对git diff/status，防止接手后覆盖其他会话工作；若跨云会话权限不足，先要导出材料而不是猜没有改动。

## 8. 导航文件与资料

- [现有架构与官方/GitHub参考](../ARCHITECTURE.md)
- [真实测试报告](../TEST_REPORT.md)
- [已知Bug](../BUGS.md)
- [本轮识别审计与修改清单](./RECOGNITION_AUDIT_20261003.md)
- [云Debug构建说明](../GITHUB_BUILD.md)
- [真实图片/真值/来源及许可](../tests/fixtures/ocr/README.md)
- [原始Android执行记录](../tests/fixtures/ocr/results/README.md)
- [历史根HANDOFF](../HANDOFF.md)（只作历史，不覆盖本报告）

此报告不包含任何密钥值。需要用户继续处理：新版真机测试与失败照片、有效Vision服务的选择/授权/设备配置；若另有云端开发会话，提供未提交改动导出。尚未满足删除本地整个项目的条件。
