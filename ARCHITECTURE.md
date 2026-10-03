# HuKang 识别链架构与证据边界

更新：2026-10-03。本轮仅处理食品拍照OCR/条码/联网识别；代码、构建与准确率验收分开。

## 正式源码与不变项

唯一实际源码目录：`/Users/yangbing/Ai/open ai/我开发的app/护康/内测/2.0/HuKang`。上级目录曾移动；Git 历史仍为 V1.4 baseline `3c415d9`、照片流程修复 `7077f1a`。不使用旧 .chatgpt-projects 工程。

`App.tsx` 自定义内存栈保持不变，没有引入 React Navigation。SQLite 写入仍由确认后的 ProductForm → database.ts 完成。没有运行 prebuild，尤其没有运行 `expo prebuild --clean`。

## 中文 OCR 模型：已从实际代码确认

- Gradle：`com.google.mlkit:text-recognition-chinese:16.0.1`，bundled 中文模型，不是需首次下载的 Play Services unbundled 依赖。
- 初始化：`TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())`，不是 Latin `TextRecognizerOptions.DEFAULT_OPTIONS`。
- JS → Kotlin：`recognizeDetailed(uri)` 返回未经改写的 text、行框、行 confidence、provider、durationMs；旧 `recognize(uri)` 保留兼容。
- `InputImage.fromFilePath` 读取文件。按调用创建 recognizer，成功/失败关闭；新图片操作在后台线程运行。
- 行 confidence 为 0/不可用时传 null。0.75 仅是保守兜底路由阈值，未经食品样本标定，不是“正确率75%”。

## 当前营养识别路径

Camera / Gallery → persistScanImage（等待复制，非空验证）→ preprocessImageForOcr → 原生 EXIF 直立化 → 用户框选营养表或选整张、可旋转90° → OCR → 保存 raw text → 行坐标恢复阅读行 → 严格 Parser → 质量不足时 Vision 直接读处理后的彩色图片 → mergeRecognitionResults → 逐字段/基准确认 → 原有商品表单 → SQLite。

主要编排：`NutritionRecognitionScreen.tsx`、`nutritionRecognition.ts`。四主入口仍由`ScannerV14`提供，`RecognitionScreen`是营养/配料/日期的薄适配器；`TextRecognitionScreen`＋`textLabelRecognition`分别解析配料与日期并确认。商品包装是条码无记录后的辅助路径，不作为第五个主入口。所有质量检测仅作提示，不阻止实际OCR/Vision。

营养额外对照未裁剪整图：EXIF非直立/镜像时使用已经由原生直立化的整图；原图/ROI分开保存native raw、Parser输入和候选。`localOcrEvidence`只在同明确基准下补缺；数值冲突留空、基准不明先选整组。不会把同一引擎两次一致当作独立高可信验证。`preserveLocalOcrConflicts`在Vision返回或确认基准切换后继续保留尚未解决的原图/ROI分歧。

## 图片处理的取舍

默认保留：实际 EXIF 1–8（含镜像）一次性直立化、用户手动裁剪、用户90°旋转、裁剪后最大边4096、JPEG高质量保存。正常照片不再在裁剪前统一缩到宽2400；极大图按堆内存/最大边作有界解码，记录 memory_downsample 步骤。输出与 Vision 使用同一份直立、彩色裁剪图，原图另存。

仅实验：`createOcrVariant`灰度＋1.1对比度、2倍插值放大、根据至少三组一致锚点估计的像素deskew。两图实际A/B无稳定收益，deskew还增加错误；均不自动启用、选择或覆盖彩色图。默认改善是保留原图证据及倾斜表格的**文本阅读几何**投影，不是像素旋转；只重排行，不改native字符或bbox。

未默认启用：自动透视、像素deskew、自动营养表检测、锐化、去噪、自适应二值化、亮度拉伸、小字插值放大。没有证据的算法不叠加；已实验的不稳定算法也不默认。曲面不能靠平面透视彻底修复。自动方向依据EXIF，不声称理解文字方向，用户可旋转90°。营养、配料、日期均可手动框选。

## Parser 与融合

- 原 OCR text 独立保存；行坐标只重排行序，不替换字符。
- 字段锚定、遇下一标签或无关文本停止；NRV% 不作营养数值；多列/多基准歧义返回 null。
- 基准缺失返回 null，不默认100g；kJ/kcal独立，不将换算值伪装为图片可见值。
- g/q、mg/mq、O/0、I/1 等有限容错记录 correctedFields；修正候选在无第二来源确认时不自动填入。损坏中文标签、不见的小数点不猜。
- 1,000 等可能是千分组的逗号数值标歧义，不擅自变成1。
- 本地足够：明确基准＋能量、蛋白质、脂肪、碳水、钠五组＋无纠错歧义＋可用较高行置信度。图片质量阈值只是提示/兜底信号，不拦住 OCR/Vision。
- 同值且同基准 → agreed；缺失一侧 → 带来源候选；数值冲突 → 空值＋两候选；基准冲突 → 不混合、要求整组选择；两侧未知 → null。最终始终由用户确认。
- 添加糖不由总糖、碳水或配料推算；Vision 还要求 raw_text 中存在匹配的显式添加糖数值，否则丢弃该候选。
- NRV只作矛盾检测（GB28050附录A核心参考值），必须有NRV表头、同物理行单个明确百分数，容许舍入误差。`suspectFields`保留原候选，融合默认留空并要求确认；禁止由百分比反推值或小数点。无NRV证据不作该检查。
- 配料保留顺序、括号、百分比；换行/破损需复核，不将后续包装段落当配料。日期保留production/expiry/shelf-life/batch/unclassified，计算日期只是需确认候选。未知计量基准/到期日不默认100g/7天；未知或不完整日总量不显示0。
- SQLite新增饱和/反式脂肪nullable列，旧记录保持null，迁移不删除数据。相关确认/表单/日志写入及旧库迁移有真实SQLite自动测试；用户设备持久化待测。

## Vision 分层诊断

`visionFallback.ts` 负责触发条件、配置、授权、连通性；`visionRequest.ts` 负责传输与错误分类；`visionProtocol.ts` 负责食品任务 Prompt 和结构校验；`vision.ts` 仍是现有 Provider 适配器。

| 阶段 | 可核查证据 |
| --- | --- |
| 未配置 | VISION_NOT_CONFIGURED；默认Key仍为空，不能凭联网开关认为已配置 |
| 未发送 | VISION_NOT_SENT + 原因：本地足够、配置错误、用户拒绝、离线、读图失败、取消 |
| 已尝试发送 | VISION_REQUEST_START、JPEG字节数、imageIncluded、Provider、Model；不表示服务器已收到 |
| 请求失败 | VISION_AUTH_ERROR / HTTP_ERROR / NETWORK_ERROR，VISION_ERROR包含phase、sent |
| 返回结果差 | RESPONSE_RAW、STRUCTURED_RESULT、LOW_CONFIDENCE；可与原图/真值比较，模型自评不等于实测正确率 |
| 返回后使用 | RESULT_STATE_UPDATED含融合结果；冲突候选与USER_CONFIRMED保留，不覆盖本地原文 |

请求带真实 JPEG `image_url` data URL、high detail，非错误OCR文本；45秒超时。配置要求 HTTPS，拒绝URL内凭证/查询串。诊断不记录Authorization、Key或图片base64。真实服务仍未测试；mock只证明构造与分支逻辑，不证明网络到达、Key有效或模型效果。

## 开发者模式与可重复评估

连续点版本号7次进入隐藏诊断。可直接看到 OCR_RAW_TEXT，完整事件保存在本地串行写入的最近记录中；普通营养结果页没有内部日志。

`ocrBenchmark.ts`内置既有两张照片/固定人工ROI，实际运行original、preprocessed、parser、production、vision、merged和三种非默认增强。production真实调用用户结果页同一`recognizeNutrition()`；真值不进入调用，只由离线scorer评分。缺Key标not_run，本地融合标local_only。隐藏自动入口仅Cloud Debug显式Intent启用，正常/Release不接受；普通用户不见诊断日志。Actions每次重跑这两图，要求最终至少7/10正确、错填0、补造0、基准正确；新增样本时须扩展守卫，不能把此底线当普遍准确率。

本机无Java/SDK/ADB，不重装；Android构建及实际MLKit执行在GitHub Actions/Android35完成。当前114测试、类型检查和最新Debug安装启动PASS；基线融合1/10正确，最新生产候选7/10正确、0错填、3未知。源码a49e85d及三份原始JSON/报告见TEST_REPORT。真实Vision及用户手机拍摄/确认仍未验收；无字符准确率统计，不用人工转写10/10代替OCR。

## 参考资料（只取设计依据，不当准确率证据）

- [Google ML Kit Android Chinese v2、bundled及字符像素指南](https://developers.google.com/ml-kit/vision/text-recognition/v2/android)：至少约16×16像素/字符，聚焦与标签占比优先。
- [Google官方CameraX示例](https://github.com/googlesamples/mlkit/blob/master/android/vision-quickstart/app/src/main/java/com/google/mlkit/vision/demo/java/CameraXLivePreviewActivity.java)、[Text.Line API](https://developers.google.com/android/reference/com/google/mlkit/vision/text/Text.Line)：中文初始化、行框与置信度。
- [AndroidX ExifInterface 1.4.2](https://developer.android.com/jetpack/androidx/releases/exifinterface)：显式依赖用于方向1–8读取。
- [Google示例Issue #937](https://github.com/googlesamples/mlkit/issues/937)：方向/行序报告供测试参考，不能据此认定HuKang遭遇SDK缺陷。
- [Expo ImageManipulator](https://docs.expo.dev/versions/latest/sdk/imagemanipulator/)、[ImagePicker](https://docs.expo.dev/versions/latest/sdk/imagepicker/)：裁剪旋转能力；自建CameraView须另外提供裁剪入口。
- [OpenCV几何](https://docs.opencv.org/4.13.0/da/d6e/tutorial_py_geometric_transformations.html)、[CLAHE](https://docs.opencv.org/4.13.0/d5/daf/tutorial_py_histogram_equalization.html)、[阈值](https://docs.opencv.org/4.13.0/d7/d4d/tutorial_py_thresholding.html)：增强仅候选，无实测不默认叠加。
- [Infinite Red RN ML Kit](https://github.com/infinitered/react-native-mlkit)、[RN OCR中文Issue #22](https://github.com/agoldis/react-native-mlkit-ocr/issues/22)：包装库不等于选择中文模型，不引入整套替代框架。
- [Google中文Recognizer官方示例](https://github.com/googlesamples/mlkit/blob/master/android/vision-quickstart/app/src/main/java/com/google/mlkit/vision/demo/java/LivePreviewActivity.java)：明确使用ChineseTextRecognizerOptions；[Issue #808](https://github.com/googlesamples/mlkit/issues/808)是旧16.0.0/Android9 ARM崩溃报告，不是本次数字错误的证据，没有照搬workaround。
- [国家卫健委GB28050-2011问答](https://www.nhc.gov.cn/zwgk/zcjd/201402/6f68ec6692594cf28d190cb47b770c11.shtml)、[附录A原标准](https://www.nhc.gov.cn/ewebeditor/uploadfile/2013/02/20130204161215710.pdf)、[2025版官方问答](https://www.nhc.gov.cn/sps/c100087/202509/470fa4ff5de14dd38619223cce9da4e7.shtml)：NRV仅一致性警告，绝不当图片数值来源或健康结论。

没有比较过PaddleOCR/RapidOCR/Tesseract真实效果，因此本轮不迁移框架。
