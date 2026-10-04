# HuKang V1.4 Test Report

## 2026-10-04 接手修复实测

源码 `bb2dd46662fa939afcd3326b53f4a89513a23e1a`，[run37197334844](https://github.com/chenchangxiang-330/Hukang-codex/actions/runs/37197334844) 两 job SUCCESS：typecheck、128/128 Node、原生 Debug 编译/签名/独立安装启动、本次 runId 真实中文 OCR、生产 API 写入65项及杀进程/断网冷启动读回18项检查 PASS。营养选择 Vision 及商品再次编辑保留 OCR/来源/独立证据；存储测试中的 Vision 明确为 mock，没有真实服务请求。两张营养图最终生产候选仍7正确/0错填/3缺失，牛奶小数点尚未解决；新PNG/JPEG/裁剪对照不默认启用。

APK [artifact11301805339](https://github.com/chenchangxiang-330/Hukang-codex/actions/runs/37197334844/artifacts/11301805339)，本地 `/Users/yangbing/Ai/open ai/我开发的app/护康/测试包/20261004-bb2dd46/HuKang-cloud-debug.apk`；135358111 bytes，SHA256 `1d401b22a76712d18e660679121c543e29be14470e81b09f4b02d9dac5e800f2`。实算与云校验一致，内置 bundle 含精确源码 SHA。包名 com.hukang.local.clouddebug，1.4.0-clouddebug/14，arm64-v8a/x86_64；临时测试签名，无用户私钥上传。

原始 JSON、截图、PID 和来源见 [执行证据](./docs/evidence/20261004-bb2dd46/README.md)；修改、失败重跑说明、清理依据及手机 NOT TESTED 项见 [完整报告](./docs/TAKEOVER_VALIDATION_20261004.md)。此前 run37194216228 的日志采集失败不计完成验收。BUG-009 保持 OPEN。

更新日期：2026-10-03。只记录已经发生的测试；未执行明确标记NOT TESTED/not_run。较早构建记录为历史，不替代最新验收。

## 2026-10-03 第一轮真实识别改进：最新验证

源码：`a49e85d87c308ef513a7bd0cb09124ba43459a9c`（main）。[云端run 37114803456](https://github.com/chenchangxiang-330/Hukang-codex/actions/runs/37114803456)：构建5m22s、安装/实际OCR验证4m04s，两个job SUCCESS。114项Node自动测试、TypeScript、原生Debug构建和签名检查均PASS。本机不编译Android，不重新安装SDK/JDK。

测试图片继续使用已有两张真实中文营养标签，未搜索/替换样本：`6923644266066.jpg`（1280×1700，每100mL）和 `6937003117814.jpg`（3024×4032，每100g）。固定人工ROI；CC-BY-SA-3.0归属/原图hash/人工真值见fixtures。真值只用于离线评分，不进入识别输入。

### 定量结果

分母均为10个真实可见核心数值：能量kJ、蛋白质、脂肪、碳水、钠。缺失仍进入分母。原图/ROI字段结果也经过Parser，因此不是OCR字符正确率。

| 同批真实Android执行 | 正确 | 错误值 | 未识别 | 字段准确率 |
| --- | ---: | ---: | ---: | ---: |
| 基线原图OCR＋旧Parser（ba77a7e） | 2 | 0 | 8 | 20% |
| 最新原图OCR＋新Parser | 7 | 1 | 2 | 70% |
| 基线ROI＋旧Parser / 本地融合 | 1 | 0 | 9 | 10% |
| 最新ROI＋新Parser | 4 | 1 | 5 | 40% |
| 最新生产链原图＋ROI安全融合候选 | 7 | 0 | 3 | 70% |

两图计量基准正确，额外补造不可见字段为0。最新融合为 `local_only`、用户确认前的候选，**没有Vision增益，也不是已确认入库结果**。最新测试真实调用结果页使用的 `recognizeNutrition()`，不是用旧文本回放代替识图。

- 牛奶：仅309kJ和58mg可靠；OCR仍为36g/449/509。NRV矛盾仅将36g标疑似，不猜3.6；最终蛋白、脂肪、碳水留空。该图2/5。
- 第二图：全图明确读出2075kJ/21g/37.7g/19g/1248mg；ROI多读3/5且千焦变干焦。实际从独立原图证据补候选，没有删除错误数字造答案。该图5/5，仍要求用户核对。
- A/B：灰度＋对比度5正确/0错/5缺（50%）；2倍放大4/1/5（40%）。像素deskew只对有可靠倾斜证据的牛奶执行：2/2/1（2/5、40%，集合覆盖50%），第二图not_run。均无稳定收益，不默认启用。几何重排行序与像素deskew不是同一处理。
- 有效基线run 37101850839；中间A/B run 37112218555；最终run 37114803456。首个harness run 37096923317是drawable文件路径读取失败，不用于准确率；e44a966运行被新确认补丁替换而取消，不计成功。

### 网络与确认验证边界

修复后的公开查询模块在Mac实际发送GET（不是mock）：6930487920475→404/status0/无记录，2929ms；6923644266066→200/正确牛奶资料，3923ms；6937003117814→200/名称缺失及112g异常营养，2390ms，标不完整并过滤异常值。这不等于Android完整扫码端到端PASS，也不是图片Vision。

Vision实际状态：**NOT TESTED WITH VALID KEY / CI_NO_VISION_KEY**。mock传输证明真实fixture JPEG字节进入请求、独立Prompt及错误分支，不证明服务器收到图片或模型准确。当前默认Key为空；用户手机当时配置未知。未配置/未发送/请求失败/返回差/冲突使用已分层记录。

配料顺序/括号/换行、日期角色/保质期单位、数值/基准冲突、SQLite新列/旧库迁移、未知不作0、网络错误和确认分支有自动测试。真实配料、喷码、独立条码拍摄测试集仍没有图片；不能报它们的识别准确率或可靠过敏原/添加剂分析通过。

### 新APK、安装和证据

- [下载最终APK artifact](https://github.com/chenchangxiang-330/Hukang-codex/actions/runs/37114803456/artifacts/11270849346)，30天保留。内含APK/BUILD_INFO/SHA256SUMS，不含私钥。
- 本机已下载：`/Users/yangbing/Downloads/HuKang-OCR-Debug-20261003-a49e85d/HuKang-cloud-debug.apk`，135335951 bytes；SHA256 `a3f58a26d239036a9e585094c189c4d77c8b2e3e58f5b3d98bf959d6ee441db1`，实际字节核对PASS。checksum文件保留runner的cloud-apk相对路径；下载解压后按APK实际位置核对，不改校验文件。
- Android35 x86_64：adb install Success、am start Status: ok、进程/UI检查通过、启动截图已人工查看（健康档案页）、crash.txt为0字节。离线独立JS启动不依赖Metro。图片回归通过固定集合的7正确/0错填/无补造/正确基准守卫。
- 包名 `com.hukang.local.clouddebug`，含arm64-v8a真机及x86_64；每次runner生成临时测试签名，不上传/缓存用户或临时私钥。可与旧正式包并存；同包名的旧云Debug签名可能不同，不能保证直接覆盖安装，需先保留旧测试数据。
- 三份未经改写的JSON均已放入 `tests/fixtures/ocr/results/`。最终下载的完整logcat/截图/启动证据在 `/private/tmp/hukang-ocr-final-a49e85d`；长期原始记录已入Git，安装证据另在Actions artifact。
- 用户真实手机相机/图库、裁剪操作、点击确认/入库/重启、有效Key Vision：**NOT TESTED**。P0尚未全面验收；源码、签名、旧APK均保留。

## 2026-10-03 较早云端Debug记录（历史）：构建、下载和安装启动PASS

- 用户要求不上传任何现有签名/keystore/凭据；仓库签名Secret为空，新工作流不引用Secret。临时Debug签名只在runner生成，不上传或缓存。
- main代码推送自动触发 [run37082741142](https://github.com/chenchangxiang-330/Hukang-codex/actions/runs/37082741142)；构建源码 `48979814c8d20063d29719f3ae29aedc80c01f4f`。2026-10-03 08:46（Asia/Shanghai）完成，两个job均SUCCESS。
- GitHub独立克隆恢复125个提交文件，Git blob/hash/执行位与正式构建提交一致；无LFS/子模块遗漏，src/assets/tests/scripts/docs/design/lockfile/Wrapper/原生OCR及注册代码完整。
- 云端 `npm ci`、类型检查与Node59/59 PASS。Gradle `assembleDebug -PcloudDebugBuild=true -PreactNativeArchitectures=arm64-v8a,x86_64`：BUILD SUCCESSFUL in 6m56s；编译job8m11s。
- APK签名校验PASS；内置 `assets/index.android.bundle`（1,731,524 bytes）。独立包名com.hukang.local.clouddebug，关闭Metro依赖，含arm64真机和x86_64模拟器架构。
- 产物 `HuKang-cloud-debug.apk`，135,297,371 bytes，SHA256 `cb3892e8acc63a51872c9c6aff606e8d83421c53a30e4c5808b9e3c296f8e568`；云端产物下载及本机下载校验均PASS。
- Android35模拟器安装job2m12s：`adb install` Success，`am start -W` Status: ok，20秒后PID非空，UI包名匹配且出现“建立本地健康档案”，crash.txt为空。截图已人工查看确认。
- 用户Android真机安装、相机、真实ML Kit准确率、有效Key Vision和融合：NOT TESTED。该模拟器测试仅证明新云包可下载安装启动，不能关闭OCR准确率问题。
- 本机精确清理23路径后：源码、Wrapper、10份旧APK、两份签名保留；Node24.20.0/npm11.19.0/Git2.54.0/gh2.102.0/VSCode1.138.0正常。gh仍登录chenchangxiang-330，新Terminal无Java Runtime自动报错。详见docs/LOCAL_ANDROID_CLEANUP_20261003.md。

## 2026-10-02 原生构建与迁移检查

- 纠正此前环境判断：旧隐藏工作区的 `.build-tools` 中实际保留JDK17.0.20.1、SDK36、NDK27.1和Gradle9.3.1缓存。此次用其工具编译正式源码，没有新安装工具、没有运行prebuild、没有回到旧源码开发。
- `./gradlew --no-daemon --offline assembleRelease`：PASS，BUILD SUCCESSFUL in 1m27s，385 tasks executed；最新Kotlin OCR模块编译通过。
- 新交付文件：`HuKang-V1.4-OCR-20261002.apk`；SHA-256 `1ad11de84510e7302b642a9b29b772ebc7718c58f21e96c555cbc7ba5dd0e72b`。
- APK v2签名验证及 `zipalign -c -P 16 4`：PASS。签名证书SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`，与旧版一致。
- `adb devices -l`：列表为空。安装、相机/裁剪交互、原图/预处理ML Kit A/B、Vision和最终字段准确率：NOT TESTED，不能因编译成功判准确率改善。
- 全部Git历史敏感文件审计：未发现已提交的真实API Key、签名、私钥、个人数据库；两张fixture哈希正确，原生源码/注册/锁文件/wrapper完整。
- GitHub工作流YAML解析、手动触发入口及Gradle缓存配置：PASS；云构建NOT RUN，签名Secret尚未设置。
- GitHub首次上传检查因本机Git未登录而BLOCKED；2026-10-02 用户完成CLI登录后重新验证：账号 `chenchangxiang-330`、仓库ADMIN、默认分支main、远端历史祖先检查及dry-run均PASS。正常推送源码迁移提交 `2393bd176e917a3e66462fa2e992e75a08903f0c` 后，GitHub API返回相同远端SHA。保留原有 `docs/`、`design/`、`research/`，未强推、未上传缓存/签名/APK。源码上传PASS，云构建仍NOT RUN。
- 源码ZIP检查：167个目录/文件entry，含Kotlin模块、wrapper、lockfile与真实fixture，不含缓存/密钥/APK；完整Git bundle验证PASS。
- 清理后检查：旧工作区八个指定可再生目录均不存在，正式与旧签名哈希一致，原生源码和JDK/SDK保留。磁盘可用空间增加约4.96GiB。详见 `GITHUB_BUILD.md` 清理实录。

## 2026-09-27 中文营养标签：当前验收未完成

### 本轮已执行检查

| 检查 | 实际结果 | 证明范围 |
| --- | --- | --- |
| Git恢复审计 | 起始只有scanMetrics.ts修改、ocrGeometry.ts新增 | 其他上轮被中断修改均重新实施并读回 |
| `npm ci --ignore-scripts --no-audit --no-fund` | 513个项目依赖恢复，锁文件未变 | 没有安装JDK/SDK/ADB/全局工具 |
| `npm run typecheck` | PASS | TS类型检查，不编译Kotlin |
| `npm test` | 59/59 PASS | Parser/融合/几何/图片哈希与ROI/评分器/mock请求及原有回归 |
| `npm run build:android` | PASS；Metro 792 modules，含2张真实JPEG | Expo Android JS与资源导出，不是APK |
| `git diff --check` | PASS | 补丁空白检查 |
| `android/./gradlew assembleRelease` | BLOCKED：Unable to locate a Java Runtime | 构建未开始；没有新的APK |
| ADB / Native / 设备交互 | NOT TESTED | 本机无Java、SDK、ADB，可用设备连接未建立 |
| 真实Vision | NOT TESTED | 无有效Key/Provider运行证据，未发真实服务请求 |
| GitHub APK工作流 | 配置文件解析PASS；GitHub运行NOT TESTED | 尚未关联Git远端、上传签名Secret或产生新版APK |

### 同一批真实图片与人工真值

未重新选择样本。图像重新目读，来源/哈希/人工ROI均已存 `tests/fixtures/ocr/nutrition/`。

| 图片 | 基准 | 能量 kJ | 蛋白 g | 脂肪 g | 碳水 g | 钠 mg |
| --- | --- | --- | --- | --- | --- | --- |
| 6923644266066，特仑苏包装 | 每100mL | 309 | 3.6 | 4.4 | 5.0 | 58 |
| 6937003117814，中文营养表 | 每100g | 2075 | 21.0 | 37.7 | 19.0 | 1248 |

共2张照片、10个核心真值字段。第一张另见钙120mg，不计入本次5字段评分；两张均没有可见添加糖、总糖、纤维或kcal。图片许可CC BY-SA 3.0，归属见fixtures README。

### 定量结果：不把人工转写当图片OCR

| 阶段 | 已执行图像数 | 正确/错误/缺失 | 字段准确率 |
| --- | --- | --- | --- |
| 原图 ML Kit OCR | 0/2 | 未测 | N/A（not_run） |
| 预处理后 ML Kit OCR | 0/2 | 未测 | N/A（not_run） |
| 实际OCR文本 → Parser | 0/2 | 未测 | N/A（not_run） |
| 实验灰度/对比度 OCR | 0/2 | 未测 | N/A（not_run） |
| 真实Vision | 0/2 | 未测 | N/A（not_run） |
| 真实最终融合 | 0/2 | 未测 | N/A（not_run） |
| 人工正确转写 → 旧7077f1a Parser | 不涉及图片识别 | 10 / 0 / 0 | 100%，仅文本解析 |
| 同一人工转写 → 新Parser | 不涉及图片识别 | 10 / 0 / 0 | 100%，仅文本解析 |

已实际从Git读取旧Parser并对同一人工转写计算，旧/新均10/10。**无法据此声称OCR准确率提升。优化前与优化后的真实图片字段准确率均未知。** 评分器无设备记录时输出准确率null、覆盖率0，不伪造0%或100%。

额外真实执行的纯Parser反例：旧版把缺蛋白值后的脂肪3.6g借给蛋白，并默认100g；新版蛋白和基准均null。旧版把1,200kJ/1,000mg解释为1.2kJ/1mg；新版标歧义、返回null。这是B层修复证据，不是A层OCR改善证据。

### Vision测试边界与分类

- Mock transport确实使用第一张JPEG的原字节base64作为请求体，断言image_url、高细节和营养专用Prompt；mock响应仅用于分支回归，**未上传到任何真实Provider**。
- 未配置：Key空时不读取/发送图片，记录VISION_NOT_CONFIGURED + NOT_SENT。
- 未发送：配置、授权、离线、读图错误/取消有单独原因；设备授权/网络分支尚未真机验证。
- 请求失败：mock覆盖401、网络异常；记录AUTH_ERROR/NETWORK_ERROR与是否尝试发出。
- 响应不可用/差：mock覆盖缺content、无效JSON、错误任务/负值、字段缺失与LOW_CONFIDENCE。
- 返回后使用：纯融合测试覆盖同值、补缺、冲突、100g/100mL基准冲突、未知基准、低confidence和添加糖缺失；真实UI交互尚未验证。
- 设备原先为何“联网没有效果”尚不能归因到某一个请求：有默认空Key、质量早退/完整度过宽和结果覆盖的代码证据，但没有那次设备日志或真实响应。

### 继续验收的可执行步骤

1. 恢复已授权的Android构建环境或关联经用户授权的云构建账户；保留手写android工程，不运行prebuild --clean。云构建也不等于设备测试。
2. 原生Build并安装新APK，先从相机/相册选营养表，核对实际方向、手动框选区域、raw text和五核心字段；检查失败不静默返回相机。
3. 我的 → 关于护康 → 连点版本7次 → 开发者模式 →「运行两张真实图片A/B测试」。未配置Key先收集本地结果，Vision明确not_run。
4. 将有效服务配置只写入设备安全存储，授权上传两张公开样本，重跑同批。确认REQUEST_START、RESPONSE_RAW、STRUCTURED_RESULT及融合记录；不能只看联网开关。
5. 导出JSON；运行 `node scripts/score-ocr-benchmark.mjs <导出文件.json>`，分别报告原图/裁剪/灰度/Parser/Vision/融合的正确、错误、缺失、基准与越界补值；保留raw和图片以区分A/B/C/D。
6. 真机逐项确认冲突、改选整组基准、手动修改、空白保存，再补用户实际失败照片。达标后才关闭BUG-009。

## 以下为2026-09-22历史测试记录（不覆盖当前版本）

## Android Build

结果：**PASS**

- 最后构建时间：2026-09-22（Asia/Shanghai）。
- Gradle Wrapper 9.3.1：`BUILD SUCCESSFUL`，385 tasks。
- APK：`android/app/build/outputs/apk/release/app-release.apk`。
- 交付副本：正式源码根目录 `HuKang-V1.4-P0-fix.apk`。
- 构建缓存已清除旧目录绝对路径，最终 autolinking 与原生依赖全部来自正式源码目录。
- 版本：1.4.0 / versionCode 14。
- 包名：`com.hukang.local`。
- minSdk 24、targetSdk 36。
- ABI：arm64-v8a、armeabi-v7a。
- zipalign 检查：PASS。
- APK v2 签名检查：PASS。
- 签名：Android Debug certificate，仅供内测。
- SHA-256：`459144e91add0b59509e6ff997e0ae443d064028e1d99b5cf87d972cac2febde`。

## TypeScript

结果：**PASS**

命令：`npm run typecheck`。`tsc --noEmit` 无错误。

## Automated Tests

结果：**PASS**

命令：`npm test`。21/21 通过。

覆盖：原有模型/解析/搜索测试，以及照片复制必须等待、文件验证先后顺序、OCR 异常不可静默吞掉的 P0 回归测试。

限制：这些是 Node 单元测试，不会调用 Android Camera、Kotlin OCR、真实 SQLite 文件、Vision API 或真机网络。

## ADB / Emulator Availability

结果：**NO DEVICE**

2026-09-22 在允许启动 ADB 服务的本机环境执行 `adb devices -l`，列表为空。本机没有可用 AVD。因此当前 Codex 没有安装修复 APK，也没有运行 Android instrumentation 或实拍测试。

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

结果：**旧 V1.4 APK FAIL（用户真机报告）/ 修复 APK NOT VERIFIED**

测试：真实商品包装正面，具体商品名未记录。

实际：拍摄 → “正在准备照片…” → 数秒后恢复 Camera → 无识别结果。

没有取得当次扫描诊断事件、文件路径、文件大小、OCR 文本或 logcat。

修复版已等待原图/work 图复制并加入明确错误提示，但由于无连接设备，尚不能标记 PASS。

## Nutrition Label

结果：**旧 V1.4 APK FAIL（用户真机报告）/ 修复 APK NOT VERIFIED**

实际：拍摄 → “正在准备照片…” → 无识别结果。

没有取得 OCR raw text 或 parser 结果。
修复版已移除空 OCR catch，并记录 `OCR_STARTED`、`OCR_CALL_FAILED`、`OCR_TEXT_LENGTH`；真机 raw text 仍待验证。

## Ingredients

结果：**NOT TESTED**

## Date / Expiry

结果：**NOT TESTED**

## Native OCR

结果：**NOT VERIFIED**

修复 APK 内包含 ML Kit 中文模型和 `HuKangOcr` 原生模块，原生编译 PASS。没有修复版真机成功 raw text 记录。

## Online Vision

结果：**NOT TESTED WITH VALID CONFIG**

请求代码已构建进 APK。Key 为空时会记录 `VISION_NOT_CONFIGURED` 并显示明确提示；没有有效 Endpoint/Model/API Key 的真机配置，因此没有成功的 `VISION_RESPONSE_RECEIVED` 记录。

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
