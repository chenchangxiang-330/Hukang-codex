# 2026-10-04 接手代码精简检查

范围：从 GitHub `main` 克隆的接手工作副本，交接基线 `6194e8fc0ad3c1a482b0b8ca37e7752ce73daad3`。仅清理已证明不可达的旧代码；识别、诊断、真实 fixtures、持久化和历史恢复材料保留。本报告的自动检查不代表真机验收或 OCR 准确率改善。

## 判断方法与入口核对

- `package.json.main=index.ts`；`index.ts` 唯一注册 `App`；实际 Expo Android entry resolver 返回 `index.ts`。
- `App.tsx` 的 `Root` 用内部路由栈渲染页面，“我的”明确渲染 `MineV13`。旧 `Mine` 是同文件未导出的局部函数，没有页面注册表或字符串调用。
- 用 TypeScript AST 从入口递归跟随静态 import/export/require 及模块解析：清理前 `src` 中只有 `model.ts` 和 `storage.ts` 不在应用依赖闭包；未发现非字面量动态 import/require。再检查测试和脚本，避免把测试专用模块当作无用模块。
- 核对 `MainActivity.kt` 的 `main` 与 Cloud Debug 测试启动参数、`MainApplication.kt` 手工 `HuKangOcrPackage` 注册、`HuKangOcrPackage.kt`、Manifest、Gradle、ProGuard、资源引用、`app.json`、`tsconfig.json`、EAS、Actions 和三个原有构建/测试脚本。仓库没有自定义 Metro/Babel 配置，没有额外 JS 页面加载器。
- 实际运行 Expo Android autolinking resolver；不能仅以没有 JS import 判断 Expo 原生依赖无用。
- 用 AST 核对全部现有 TSX `StyleSheet.create` 消费，`App.tsx` 的 `s` 没有动态 `s[...]` 调用，也未传给外部组件；其余 TSX 没有发现同类未消费样式。

## 已执行的三批清理

| 批次 / 文件位置 | 证据 | 删除影响 | 实际处理与验证 |
| --- | --- | --- | --- |
| 1：`App.tsx` 旧 `function Mine` | `Root` 只渲染 `MineV13`；局部函数不导出；入口、原生、动态调用、配置和脚本均未注册它。旧函数重复档案、通知、音效、JSON 导出和清空 UI，现由 `MineV13` 实现 | 移除不可达旧页面；实际“我的”、诊断、Vision 配置与导出仍由 `MineV13` 提供 | 删除旧函数和只供它使用的 `Switch`、`Sharing`、`File`、`Paths` 导入；同时删除未使用的 `useRef` 导入。`npm run typecheck` PASS，`npm test` 114/114 PASS |
| 2：`src/storage.ts` 的 `loadState/saveState` | 应用依赖闭包不包含它；测试/脚本也未调用；原生和配置没有注册；当前商品/库存/摄入通过 `database.ts` SQLite，档案/偏好通过 `preferences.ts` AsyncStorage | 删除不再调用的另一套状态保存封装，减少误用旧模型的机会。没有执行 AsyncStorage remove/clear，没有删除设备上 `@hukang/local/v1` 数据；没有改变 SQLite 表或迁移 | 删除此 10 行文件；保留旧 `model.ts` 和其测试。首次类型检查遇到其他并行修改的 `OcrRegressionHarness` 新 `runId` 参数尚未接入，因此失败，未记为通过；该接入完成后重新实际运行 `npm run typecheck` PASS，`npm test` 124/124 PASS |
| 3：`App.tsx` 的 `s=StyleSheet.create(...)` 中 23 个属性 | AST 逐项确认无任何 `s.foo` 消费、无动态索引、样式对象不导出；这些属性不是 Android XML 资源或配置项，实际扫描样式在 `ScannerV14` 等模块各自定义 | 删除未渲染的旧样式，不改变当前 UI | 删除下列 23 个属性；`npm run typecheck` PASS，`npm test` 124/124 PASS |

第 3 批属性：`day`、`empty`、`mode`、`icon`、`overlay`、`scanbox`、`badge`、`fab`、`scannerTop`、`scanClose`、`scanTitle`、`scanControls`、`scanTabs`、`scanTab`、`scanTabText`、`scanDot`、`shutter`、`shutterIn`、`library`、`qualityWarning`、`debugLink`、`debugBox`、`debugText`。

检查日志保存在接手环境临时目录：`/private/tmp/hukang-cleanup-batch1-test.log`、`hukang-cleanup-batch2-test.log`、`hukang-cleanup-batch2-recheck-test.log`、`hukang-cleanup-batch3-test.log`。第 2 批首次独立测试 116/116 PASS；其他工作加入测试后，重新检查为 124/124。数量变化来自并行增加测试，不是删掉旧测试。`git diff --check` PASS。

本清理没有改原生代码或构建配置。接手工作中的原生识别实验、诊断和存储验证由其他修改负责，完整合并版本的云构建结果应在交付报告中另行记录，不能把已有 APK 的成功构建当作本次修改已经构建通过。

## 保留项、重复逻辑与建议

| 文件位置 / 候选 | 判断依据 | 删除或合并影响 | 本次处理 / 建议 |
| --- | --- | --- | --- |
| `src/model.ts`，包括旧 `foods`、`State`、`freshState`、`parseState`、`totals` 及日期工具 | 当前应用不加载，但 `tests/model.test.mjs` 有 6 个实际测试，涵盖旧状态序列化、损坏/不兼容存档、食品与药品分离。`uid` 等还有内部调用 | 整文件删除会移除旧格式解析代码及其验证材料；当前主业务用 `types.ts/database.ts`，但历史恢复用途尚未完全排除 | 保留；报告为“测试仍使用、应用未加载”，不宣称无用。`expiryLabel` 暂无调用，但不拆散历史模型 |
| `src/ocr.ts:recognizeText` 与原生 `HuKangOcrModule.kt:recognize` | JS 文本包装函数暂无当前调用；`recognizeDetailed` 中仍按原生能力判断并回退到 `native.recognize` | 删原生方法会损坏兼容回退；删 JS 包装影响历史内部 API，收益小 | 核心 OCR 边界保留，后续可单独废弃 JS 包装；不能连带删除原生方法 |
| `src/vision.ts:OpenAICompatibleVisionProvider` | 无当前应用调用，注释明确标记旧页面兼容适配器；当前 `visionFallback.ts` 使用 `OpenAICompatibleFoodVisionProvider` | 适配器可在兼容期结束后删除，不能删除当前 Provider 或 SecureStore 配置 | 本次保留核心服务边界，避免与真实 Vision 未验收工作混改 |
| `src/vision.ts` / `src/visionProtocol.ts` 的 `VisionMode/VisionConfig/StructuredResult` | 两处类型结构重复；当前结构类型相容，请求仍共用 `requestVision` | 分别维护有漂移风险；直接合并需核对 Provider 与测试的边界 | 建议以后从 protocol 单一导出再由适配器 re-export；本次不改协议 |
| `nutritionRecognition.ts` / `textLabelRecognition.ts` / `ProductRecognitionScreen.tsx` 的图像质量、OCR、状态事件编排 | 均实际调用；任务不同。营养还需原图/ROI、字段/基准冲突；配料和日期保留独立原文与确认；包装用于商品身份候选 | 用一条抽象流水线替代会影响来源、取消和诊断顺序，难以仅靠单元测试证明等价 | 保留任务编排，共用现有 `ocr/imagePreprocessing/visionFallback`；只在真实失败证明同一缺陷时提取对应小步骤 |
| `productLookupService.ts` / `productSearch.ts` | 都本地优先，但前者专门处理确定条码；后者处理包装线索、候选评分和搜索。两者均使用现有 OFF 规范化/传输模块 | 合并可能改自动条码补查、模糊搜索和候选排序行为 | 保留；重复的 NetInfo 检查属于不同入口，暂不重构 |
| `productRequest.ts` / `visionRequest.ts` | 两个传输模块都有 fetch/abort/诊断，但前者公开 GET、7/8 秒及 OFF 404 未命中语义；后者认证图片 POST、45 秒、配置/图片/返回分层错误及密钥清理 | 通用网络封装容易把授权、图片和错误体写入诊断，或丢掉阶段证据 | 保留；不把它们当作可随意删除的重复函数 |
| `App.tsx:onlineDraft/candidateDraft`；`ProductConfirm.tsx` / `App.tsx:ProductForm` 保存参数构造 | 营养空值转换与字段列举重复，但来源、图像、原始 OCR 和编辑/新建语义不同；均实际被确认流程调用。最终保存共用 `DB.saveProduct` | 合并错了会丢独立证据、来源或 NULL 语义 | 暂不合并核心确认流程；先用真实入库和重启证据定位问题。共享保存函数已经存在 |
| TSX 默认 `React` 导入，以及 `src/ScannerV14.tsx` 的 `Image/ScrollView` 导入 | 用额外 `tsc --noEmit --noUnusedLocals --noUnusedParameters` 诊断出 12 个未使用导入；不是项目规定的类型检查失败。没有发现额外未用局部函数/参数 | 纯导入可低风险清理，但 JSX 转换与 React 命名空间类型需逐文件核对 | 本次只清理负责的 `App.tsx`，其余列为下一批候选；没有为消警告改 tsconfig 或编译模式 |
| `assets/mascot.png`、`assets/mascot.svg` | 当前 JSX 吉祥物由 `App.tsx:Mascot` 绘制；图片未被当前应用加载。`assets/README.md` 和 `design/README.md` 明确有产品素材/吉祥物归档用途 | 删除会丢品牌源素材，未证明只是可重建垃圾；不会帮助识别 | 保留归档素材；不用“无 import”作为删除依据 |
| `android/app/proguard-rules.pro` 的 Reanimated keep 规则 | 当前 package/lock 中无 Reanimated，配置可能是历史遗留；Cloud Debug 也未启用 release 缩减 | 涉及原生 release 规则，删除收益小且需要对应构建验证 | 记录候选、保留；本次不为此触碰原生配置 |
| `RecognitionScreen`、所有实际识别页面、`ImageCropper`、`MineV13`、`RecognitionDiagnostics`、`OcrRegressionHarness`、`ocrBenchmark`、scorer、fixtures/results | 入口/当前调用链或 Cloud Debug/隐藏开发者入口可达；benchmark 的图片 `require` 是真实测试资产加载 | 删除会损坏主流程、A/B 或用户诊断 | 全部保留；隐藏入口和测试用途同样属于有效用途 |

## 依赖检查

没有确认可以安全删除的直接依赖；本次没有改 `package.json` 或锁文件。

| 依赖 | 实际用途 / 保留依据 |
| --- | --- |
| AsyncStorage、NetInfo | `preferences.ts/scanMetrics.ts` 档案/偏好/诊断；条码/包装/Vision 网络状态 |
| Expo、React、React Native、safe-area-context | `index.ts/App.tsx` 启动、组件运行和安全区域 |
| expo-asset | `ocrBenchmark.ts` 两张真实测试照片加载；不是因只在诊断出现就删除 |
| expo-audio、expo-blur、expo-status-bar | `App.tsx` 启动音效、现有 Card、状态栏 |
| expo-camera、expo-image-picker、expo-haptics | `ScannerV14.tsx` 相机/图库/扫描反馈；Camera/Picker 另有 `app.json` 权限配置 |
| expo-file-system、expo-image-manipulator | 图片保存/预处理/分享/诊断；Vision `legacy` 文件读取来自同一个 file-system 包 |
| expo-notifications | `notifications.ts` 到期提醒、`app.json` 默认通知频道、Manifest 元数据 |
| expo-secure-store、expo-sharing、expo-sqlite | `vision.ts` 设备密钥、`MineV13/RecognitionDiagnostics` 导出、`database.ts` 主数据；都有原生 autolinking 和配置用途 |
| expo-splash-screen | `app.json` plugin、`MainActivity` 原生注册、`Theme.App.SplashScreen` 和多 DPI 图片资源；不能因无 JS import 删除 |
| expo-system-ui | 实际 Android autolinking 包含 SystemUIModule；`app.json.userInterfaceStyle=light` 与原生 `strings.xml:expo_system_ui_user_interface_style` 对应，其 plugin 处理此配置 |
| react-dom、react-native-web | `npm run web` / Expo 的 Web 目标仍保留；不扩大本轮范围为删除平台支持 |
| @types/react、typescript | JSX 类型和 `npm run typecheck`；构建前检查的实际依赖 |

原生 Chinese ML Kit、ExifInterface、手写 OCR 注册和 Gradle Wrapper 全部保留。没有删除或上传本地源码、旧 APK、历史 ZIP/bundle、keystore、JKS、API Key 或用户数据。精简仅减少当前不可达代码与误导性旧保存路径，不宣称解决了牛奶缺小数点或提升了整体识别率。
