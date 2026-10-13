# OCR 证据持久化范围审计（2026-10-12）

本次只扩展识别证据的保存与验证，不改变营养算法、原始 OCR 字符、SQLite 表结构，也不重构配料、日期或商品候选业务路由。

## 原始证据与确认结果

`src/recognitionSaveEvidence.ts` 继续把完整 primary/original OCR 对象及独立 Vision 放进既有 `recognitionEvidenceJson`，不会按最终选择改写原文。行框、多边形坐标、坐标空间、图片 URI/SHA、模型文件 SHA/字节、版本、原生耗时、内存与时间分项均随原始对象保存。

营养结果页只在用户的确认回调真正执行后附加 `images` 和 `confirmed`。`confirmed` 保存已选择的计量基准与数字/NULL；原始对象、Vision 和确认数字相互独立。未传确认值的调用不会虚构确认记录。商品改名或普通编辑继续使用 `productSaveEvidence` 保留原文、来源及 JSON 原字节。

## 四入口的独立本机归档

所有成功的 `recognizeDetailed` 调用共用 `src/ocrEvidenceArchive.ts`：每次写入独立的 `documents/ocr-evidence/<id>/evidence.json` 及 `input-image.bin`。

- JSON 保存原始 native 对象和单独的实际 parser input，没有营养真值、推测数值或用户确认值。
- 输入图片按原字节复制，复制前后使用原生流式 SHA256/字节数核对，不重复推理、不联网。
- 每张保留图片限制为 64 MiB；输入不存在、过大或 SHA 不同会明确失败。
- 返回 `evidenceUri`、`retainedImageUri`、实际归档耗时；原生元数据缺项仍保留可读证据但标记 `partial` / `archivalError`，不补造模型身份或耗时。
- 归档失败由 OCR 入口记录诊断并保留原始识别返回；失败不能计作“完整证据保存成功”。

独立归档涵盖营养、配料、日期及辅助包装 OCR。但现有 QA04 业务关联缺口仍存在：配料商品保存主要传 raw text，日期库存路由只传两项日期，包装候选确认主要传商品线索。这些业务记录尚未直接关联完整 JSON 证据；不能把独立文件归档说成四入口 SQL 证据链全部完成。

## 实际 Paddle 执行记录的存储回归

`StorageRegressionHarness` 可显式传 `paddleOcrRunId`，读取固定本机文件 `ocr-regression-paddle.json`。校验同一次运行、同一源码 SHA、Paddle、completed 和两个公开 fixture 的 production result，拒绝旧记录、其他来源照片和不完整结果。不会读取人工真值。

已有 synthetic/mock Vision 场景继续单独保留。新增实际 OCR 场景使用真实 production 候选，未解决的冲突或不确定字段留 NULL，以 `automated_storage_regression_not_user_review` 标明自动模拟保存；不代表用户点选确认。

每个实际 fixture 执行原始归档核对、图片 SHA/字节复核、商品保存、改名和完整证据读回。外部脚本杀进程并断网后，verify 再检查完整商品、独立归档 JSON 原字节和两份实际图片的 SHA/字节。该测试没有调用 Vision 服务，也不证明识别准确率。

## 验证边界

本地相关 16 项 Node 测试及 TypeScript 检查通过，包含真实磁盘 SQLite 关闭重开、完整元数据/图像身份/确认值分离、改名保留、NULL 与明确 0、运行记录匹配和归档错误分支。Node 数据由模拟保存材料构造；不是实际 Paddle 推理，也不是 Android 冷启动验收。

本轮源码17d52da65733741956576db3ae397725e8237d90在Android35 x86_64实际执行：OCR runId `ocr-paddle-1791763564-3255`、存储runId `storage-1791763579-3330`，write151 / verify27检查通过，force-stop后launchToken不同，NetInfo.isConnected=false。真实公开图片和独立归档SHA/JSON原字节读回通过；合成Vision不代表服务运行。原始执行和检查摘要见 `tests/fixtures/ocr/results/paddle/20261012-17d52da-api35/`；cloud run38186191792的API24启动器挂住后取消，未执行这项验收。最终默认Paddle源码8f02cdd的Android35实际默认probe、双引擎和存储回归通过；API24模拟器未完成启动，未执行App。用户手机触摸确认、四入口业务关联和真实 Vision 服务仍须独立验收。
