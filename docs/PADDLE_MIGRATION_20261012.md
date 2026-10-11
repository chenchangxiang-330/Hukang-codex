# Paddle OCR Android 迁移报告（2026-10-12，待完成）

本文件在迁移工作进行中建立。接续源码基线：`a98fc594cc8bc416d8f9f386f19e185126746e38`，独立分支 `codex/paddleocr-android-migration`。本轮应用提交、模型身份、Android 实际推理、测试、云构建、APK 与同图前后对比结果须由最终执行证据补齐；以下没有宣称本轮构建或 Android 识别已经通过。


本轮已推送应用提交 `5e354fb38b317104ef7910a5310a0285277f1e94`，创建 [PR #1](https://github.com/chenchangxiang-330/Hukang-codex/pull/1)（草稿），[首次云端 run38185589167](https://github.com/chenchangxiang-330/Hukang-codex/actions/runs/38185589167) 正在原生构建。默认仍 ML Kit，显式 Android 同图门禁通过后才能切换。后续仅文档提交不代表已生成新 APK。

只读参考完整提交：`5af9d4a5e6cd3ee91e09e7adaf6921dfce696852`，分支 `codex/mainland-v2`。完整/浅克隆因 GitHub 连接重置失败，实际 Kotlin、配置来源锁与许可通过 GitHub 文件 API 在此完整提交读取；没有修改参考仓库、提交、推送或触发其构建。两模型从官方 BOS 原始归档直接重新取得，按参考独立来源锁校验，不从 APK 提取、不重新转换或量化。

静态/主机验证：TypeScript PASS，143/143 Node tests PASS，脚本语法、diff检查 PASS；模型及原始配置逐字节 SHA 和完整有序字典验证 PASS。字典原18383项（首项U+3000），有效18384项，CTC输出18385类；有序字典SHA `02c0a0121c577dfa211f11de21084e3abd23478a77ea4fbdf71ee7a3e990a717`。检测模型4826518 bytes/SHA `a431985659dc921974177a95adcfbb90fd9e51989a5e04d70d0b75f597b6e61d`；识别16534782 bytes/SHA `da72dc72ca4dc220df0dfde68c1dedc31c58d3e76a25871122e5056227d50092`。配置SHA、固定官方revision与参数见 `models/paddleocr/v5-mobile/manifest.json` 和 `source-lock.json`。这些不等于Android推理。

依赖实际AAR只读检查：ORT 1.21.1 minAPI24、OpenCV4.5.3.0 minAPI21，均包含arm64-v8a/x86_64。保留本项目API24与两ABI配置，尚待APK核验/安装。固定Kotlin检测BGR/最长边960/stride32、识别BGR/48高/最小320宽，原始完整字典和配置随APK打包，telemetry关、推理无模型下载。Paddle/ORT/OpenCV/QuickBird完整许可随APK资产保留。保留ML Kit；诊断页可持久设置ML Kit兼容回退，显式benchmark忽略设备override且不暗中fallback。

所有成功OCR入口独立保留原始native、parser input及实际输入图片原字节和SHA，营养确认值独立section。Paddle原图decodecap8MP/4096可能与旧ML Kit内部解码不同，每次记录sampleSize/坐标空间/矩阵，不能说两引擎输入像素必然相同。OpenCV部分异常释放缺口已补finally。QA-04 SQL业务关联缺口未重构，四入口独立归档不等于全部业务证据关联完成。

本轮API24/35 x86_64云验证计划：先APK身份/模型/native ABI/安装启动，然后关闭Wi-Fi/移动数据、真实ML Kit和Paddle原图/ROI/生产链分别输出运行ID；核对10字段及牛奶三个小数原文；真实OCR证据模拟保存和改名，再force-stop/离线冷启动核对JSON与真实图片hash。原生同50ms采样PSS/Java/native heap，只是观察峰值；不等于绝对峰值或手机性能。真实手机、ARM64设备、EXIF2–8、16KB页、触摸UI和扩展实图仍待验。

## 本轮迁移结果：待填写

| 项目 | 状态 / 后续应填写的证据 |
| --- | --- |
| 应用源码提交 / APK 内置提交 | 待填写完整 SHA；区分源码提交、文档提交和实际构建提交 |
| 原生运行时、模型 / 字典 / 参数身份 | 待填写精确版本、文件 SHA-256、预后处理、ABI；不能仅写“Paddle” |
| 类型检查与自动测试 | 待填写实际执行命令、数量及结果；回放和纯函数测试单列 |
| GitHub Actions 原生构建 | 待填写 run URL、检出提交、实际日志结果 |
| 安装包 | 待填写可获取路径/产物链接、包名、版本、ABI、APK SHA-256及签名边界 |
| Android 原图 / ROI 实际推理 | 待填写设备/API/ABI、runId、输入 hash、独立原文/行框、正确/错误/缺失、基准、额外断言；未执行不得写为通过 |
| 原模型同图前后对比 | 待填写本轮实际对照；历史归档必须标明日期/环境，不能冒称本轮重跑 |
| 确认保存 / 编辑 / 强停 / 离线冷启动 | 待填写实际执行范围及读回证据；API harness、触摸 UI、真实手机分开 |

## 前置研究的证据边界

本轮只读核对了本机第一轮独立验收与研究材料：

- `/Users/yangbing/Ai/open ai/我开发的app/护康/验收/20261005-第一轮/第一轮验收报告.md`：报告日期 2026-10-06，执行日期 10-05 至 10-06；代码检查锁定 `a98fc594`，已核验的旧 APK 源码为 `bb2dd46662fa939afcd3326b53f4a89513a23e1a`。结论是“不通过完整功能验收，可继续受控内测”。128 项自动测试及旧云证据不等于本轮新版本已经验收。
- `/Users/yangbing/Ai/open ai/我开发的app/护康/研究/20261005-recognition-product/`：已读 `初步研究报告.md`、`ocr-audit.md`、`online-ocr-readiness.md`、`product-sources.md`、`experiments/README.md`；研究保持主工程只读。
- 2026-10-12 只读核对本机正式源码仍为干净的 `main/a98fc594`，对应 QA 代码尚在；这是本机核对，不是新的远程 main 一致性证明。

研究于 2026-10-05 在 **Mac M4 CPU、RapidOCR 3.9.2、ONNX Runtime 1.19.2** 实际运行 PP-OCRv5 mobile/server，使用原有两张许可营养照片及固定人工 ROI。mobile 原图和 ROI 经现有行框几何/Parser，各为 10 正确 / 0 错误 / 0 缺失；原始识图文字实际包含牛奶的 `3.6g`、`4.4g`、`5.0g`。该结果仅覆盖两图十个核心数值，不是全文或整体食品准确率。

这不是 Android Paddle 推理。把研究 JSON 回放给 Android/JS 适配器，仅证明结构、几何、解析或融合对接，也不是设备重新读图。研究没有额外运行 Paddle Python 原生产线；RapidOCR 是承载 PaddleOCR 家族权重的框架，不能把两个名称当两份独立识别能力。mobile/server 同家族、原图/ROI 同照片，也不能增加独立样本数或用于多数投票证明可靠。

研究的 server 原图 10/0/0、固定 ROI 9/0/1；缺项是牛奶钠/钙标签合并。未经几何重排的原始文字顺序直接 Parser，各配置仅 4/0/6，说明只接字符串不够。研究的单次 Mac 耗时、权重体积不能当 Android 时延、峰值内存或 APK 增量；无重复 p50/p95 证据。

历史 ML Kit Chinese 16.0.1 两图生产候选为 7 正确 / 0 错填 / 3 缺失，来自 2026-10-04 Android35 x86_64 归档。牛奶原文已有 `36g`、`449`、`509`，Parser 不能根据 NRV、数据库或固定除十合法恢复。未知仍须留空；原始文本独立保留，不能因更换引擎覆盖。

研究和第一轮验收均没有真实在线 OCR/Vision 成功记录；第一轮受控组件调用、请求体测试和历史 `not_run/CI_NO_VISION_KEY` 必须单列。当前 App 的通用兼容 Provider 不能仅更换地址便宣称接入 Qwen 专用 OCR 或腾讯签名接口。

## QA-02～06：独立缺陷，仍未修复

以下从第一轮验收报告提取，并在 2026-10-12 的本机基线代码中只读核对。它们不属于“Paddle 原文是否读对”的评分；更换 OCR 引擎本身不能关闭这些问题。本轮未复测或修复这些 QA。后续若改动对应位置，应补新的针对性结果和手机验收，再更新状态。

| 项目 / 优先级 | 基线位置 | 实际问题与证据层级 | 当前状态与完成条件 |
| --- | --- | --- | --- |
| QA-02 / P1：未知条码包装辅助路径跳过 Vision | `src/ProductRecognitionScreen.tsx:40,62`；`ScannerV14` 的 pendingBarcode 传递；`App.tsx` label 路由 | 受控 Node VM 触发实际组件逻辑，React/原生/服务为替身。携带未知码时配置读取 0、Vision 调用 0，记录 `SCANNER_BARCODE_PRIORITY`；无码对照各调用 1 次。不是已运行真实 Vision | **仍未修复**。条码无资料后应保留码值，在配置、授权、在线条件满足时允许包装 Vision；带码/无码、失败原因分别验证，再完成真实手机闭环 |
| QA-03 / P1：“250毫升”映射为“250g” | `App.tsx:candidateDraft`，基线第 12 行 | 用真实函数与合成输入复现：`quantity="250毫升"` 输出 `netContent="250"`、单位 `g`；`250mL` 对照为 mL。这是净含量转换，不是营养基准或真实识图实验 | **仍未修复**。毫升/ml/mL统一 mL，克/g统一 g，L/kg保留；未知单位不猜默认值；确认保存和重启核对 |
| QA-04 / P2：配料原文被覆盖，非营养入口证据不完整 | `App.tsx:ProductForm`，基线第 47 行；`TextRecognitionScreen.tsx:47–49`；`database.ts:51–53,59–60`；包装 `onManual/onCandidate` 路由 | 实际组件回调 + Node SQLite 适配器执行真实 SQL；配料/日期输入与 Vision 为合成。仅改商品名使 `ingredientsRawText` 从“配料：生牛乳”变“生牛乳”；配料选 Vision 后本地 `ocrRawText` 留存，但 `recognitionEvidenceJson=null`，远程原文/结构未保存；日期仅传生产/到期两个字符串，保质期、计算/显式来源、图片与证据未传下游。包装路径亦缺完整业务持久证据 | **仍未修复**。原文字段与确认值分离，各入口独立本地/Vision/来源/日期依据持久化；再扫描、仅改名称、强停离线重启后逐字比较。营养 OCR/evidence/source 在第一轮编辑复现保持，不能泛称所有 OCR 都丢失 |
| QA-05 / P2：响应另一条码仍判定命中 | `src/productLookup.ts:14–20`；`productOnlineLogic.ts:classifyLookupBody/normalizeOnlineProduct` | 合成 HTTP200/status1 请求码 `6930487920475`，返回码 `6937003117814`，实际 `lookupBarcode` 仍 `ok:true`。请求 fields 未纳入 code、无身份一致性校验；不是证明公共接口真实发生错配 | **仍未修复**。归一化请求/响应 GTIN，支持合法 UPC/EAN 等价；不一致单独分类并拒绝匹配，避免写入当前码缓存 |
| QA-06 / P2：BUG-007 variant/category 丢失 | `App.tsx:candidateDraft`，基线第 12 行；候选类型位于 `src/productSearch.ts` | 实际函数的合成输入包含 `variant="原味"`、`category="乳饮料"`，草稿不包含二字段。当前候选类型本身未统一 category；与 QA-03 使用同一动态脚本。不是营养数字评分问题 | **仍未修复**。候选契约、映射、确认、保存和重开保持口味/类别；明确空值语义 |

第一轮可复核材料均留在本机验收目录，不随本轮上传私人照片或数据：

- `证据/network/controlled-checks.mjs`、`controlled-checks.json`：QA-02、QA-05，scope 明确为 mock/非 Android UI/非真实网络。
- `证据/root/check-candidate-draft.cjs`、`candidate-draft-results.json`：QA-03、QA-06，真实转换函数与合成输入。
- `证据/persistence/reproduce.cjs`、`reproduction-results.json`、`findings.md`：QA-04；历史营养证据保持与非营养证据缺口分开记录。

## 待验与缺材料

### 用户原始失败材料尚缺

| 材料 / 场景 | 已有证据 | 尚缺与验收用途 |
| --- | --- | --- |
| 用户“4.0→40”失败 | 第一轮 U-01 只有现象描述 | 原始未压缩照片、照片上可读真值/计量基准、原始 OCR/结果截图、当时 APK SHA、设备型号/Android 版本与诊断；不能把该现象强行归属旧目标包或当前迁移版 |
| 配料 / 包装 / 喷码失败 | 第一轮 U-03 为历史描述；文本规则和合成回调测试 | 各真实原图、人工可读真值、图库/相机结果及当次诊断；现有目录仅说明材料，无相应实图准确率 |
| 用户条码 `6930487920475` | 10-05/06 Mac 真实公共 GET 为 OFF 404/status0；网页同码线索规格 23g/24g 冲突 | 当前实物正面/背面/条码/规格照片、实际安装版本与手机扫描数字/查询诊断；未核清精确身份与规格，营养和生产日期不能推断 |
| 扩展样本 | 仅两张公开许可营养表；固定 ROI 是派生输入 | 建议补 20–30 张初筛照片并按商品分组留出，覆盖反光、曲面、小字、倾斜、单位、每份、多列及喷码；此数量不是统计充分性承诺。未授权私人照片不上 GitHub |

### Android 和真实使用验收仍需单列

1. **实际版本和设备**：用户手机当前安装 APK 尚未验证；最终给出本轮可获取包及内置源码 SHA，记录型号、Android/API、ABI。若临时云签名冲突，先保留旧包和数据，不自动卸载或清存储。
2. **设备识图与图像链**：本轮 Paddle 必须在 Android 实际读取原图/ROI；记录 EXIF/尺寸/重编码/输入 hash、模型/字典/参数、原始文字和位置。Mac 实验、研究 JSON 回放、人工转写 Parser 都不能替代。相机/图库/权限/前后台/裁剪/旋转仍需用户手机完成。
3. **同图正确/错误/缺失**：五核心字段、营养基准、单位、不可见字段断言分别评分。不可读值留空，不猜点、不由 NRV 倒推；原图/ROI/Vision 冲突由用户确认。两图领先不足以宣布整体准确率或关闭 BUG-009。
4. **保存与重启**：用真实包装照片，选择候选/手填/留空，保存商品、库存和摄入，导出 A；仅改名称后导出 B；Android 设置强行停止，飞行模式且关 Wi-Fi，离线重开导出 C。比较值、基准、照片、原始 OCR、来源、独立证据和关系。历史 write 65 项 / verify 18 项来自直接生产 API、mock Vision、1×1 PNG，不替代触摸 UI 或真实照片。
5. **真实 Vision**：仍缺用户选定的服务/地域、有效权限、预算，以及实际图片字节数、Provider/model、HTTP、原响应、结构结果、确认后读回证据。密钥只在设备安全配置，不发送聊天、不提交仓库。服务未运行记未验，不能记 0% 或通过；QA-02 旁路也不能由新离线 OCR 自动关闭。
6. **Android 旧库与性能**：真实用户旧 SQLite 升级、真实照片长期可读、连续多图内存/时延、冷暖启动、32/64 位支持与最终 APK 增量仍须测量；不能照搬 Mac 单次耗时或模型文件体积。
7. **证据颗粒度与其他回归**：当前营养独立原文/结构保存已实现；字段所选来源、手改前后、确认时间、图像位置/hash仍需核对。QA-04 的配料/日期/包装完整持久链及返回手势、通知、档案、今日/历史、编辑删除、权限分别验收，未覆盖项保持未验。

这些为待做项。本轮最终报告应在前面的结果表补上实际完成范围，同时保留本节的未验事项；不得用新引擎或构建成功覆盖第一轮独立缺陷。
