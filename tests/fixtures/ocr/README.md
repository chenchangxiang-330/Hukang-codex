# 中文食品 OCR 真实图片基准

此处续用 2026-09-26 上轮已选定的两张 Open Food Facts 标签照片，未更换样本、未生成图片。人工重新目读标签建立真值，不使用商品数据库营养数值作为答案。照片来源元数据与许可于同日复核。

| 图片 | 贡献者 / 原始版本 | 基准 | 能量 kJ | 蛋白质 g | 脂肪 g | 碳水化合物 g | 钠 mg |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `nutrition/6923644266066.jpg` | macrofactor / nutrition_zh.15.full.jpg | 每 100 mL | 309 | 3.6 | 4.4 | 5.0 | 58 |
| `nutrition/6937003117814.jpg` | smoothie-app / nutrition_zh.8.full.jpg | 每 100 g | 2075 | 21.0 | 37.7 | 19.0 | 1248 |

每张同名 JSON 保存来源链接、原图 SHA-256、像素尺寸、人工文字转写、5 个核心字段、未出现的字段以及固定人工裁剪框。第一张另外可见钙 120 mg，但本轮核心字段评分不包括钙。两张均没有明确出现总糖、添加糖、膳食纤维或 kcal，不能把这些字段当成可见数据补全。

## 许可与归属

图片为原文件复制，未改动；版权归相应贡献者，按 [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) 使用。该第三方图片许可不受项目 `0BSD` 代码许可替代。图片中的商标不因此获得额外授权。派生预处理图片须保留归属、许可及处理说明。依据：[Open Food Facts 使用条款](https://world.openfoodfacts.org/terms-of-use)。

- macrofactor，Open Food Facts：[商品](https://world.openfoodfacts.org/product/6923644266066)，[原图](https://images.openfoodfacts.org/images/products/692/364/426/6066/nutrition_zh.15.full.jpg)。
- smoothie-app，Open Food Facts：[商品](https://world.openfoodfacts.org/product/6937003117814)，[原图](https://images.openfoodfacts.org/images/products/693/700/311/7814/nutrition_zh.8.full.jpg)。

## 真实运行与评分

设备导出每张图的 `fixtureId` 及主要五阶段 `stages`：`original`、`preprocessed`、`parser`、`vision`、`merged`，另单独保留非默认的 `experimental_gray`（灰度＋温和对比度）实验结果。每阶段包含：

```json
{
  "status": "not_run",
  "reason": "No execution record supplied"
}
```

实际执行后用 `status: "ok"` 或 `"error"`，保存实测 `rawText`、`fields`（snake_case 核心字段）、`basis: {"amount": 100, "unit": "g"}`、错误原因等。`merged` 只有本地结果时注明 `scope: "local_only"`，不能称为已验证 Vision 融合。未配置 Vision Key 的阶段是 `not_run`，不是联网通过或 0% 准确率。

在项目根目录运行：

先在新版 Android APK 的「我的 → 关于护康 → 连续点击版本号 7 次 → 开发者模式」运行两张真实图片 A/B 测试并导出 JSON。这个入口真实调用设备端 ML Kit，不读取人工转写作为输入；未配置或拒绝联网时 Vision 保持 not_run。普通用户页面不显示诊断内容。

```sh
node scripts/score-ocr-benchmark.mjs device-export-1.json device-export-2.json
```

支持单个运行对象、对象数组或 `{ "runs": [...] }`。同一批次每张图只能有一条记录，重复样本会报错，避免静默选择最佳结果。没有参数时输出各阶段 `not_run` 和准确率 `null`。

字段级准确率 = 正确字段 / 已执行样本中的真值字段。报告同时给出总真值字段、执行覆盖率、正确/错误/未识别、失败图片、未执行图片，以及错误基准和图片不存在字段的额外断言。未执行样本不进入准确率分母；真正尝试后报错的阶段计为失败且 5 个字段未识别。原图/处理后 OCR 的字段评分仍经过 Parser，需结合原始文本和几何信息区分 OCR 与 Parser 责任，不宣称是字符准确率。

固定 ROI 是人工为这两个样本确定的实验条件，不代表已实现自动表格定位。必须分别保留全图、裁剪图、其他可选增强图的运行结果；未实测的增强不能宣称提高准确率。切勿把 `manualTranscription` 写入设备 OCR/Vision 输出。

## 当前证据边界

此批次只有两张照片、10 个核心营养字段，不代表真实使用场景的总体准确率。目前缺少 Android 执行环境与有效 Vision Key，图片 OCR、预处理 A/B、Vision 和最终真实融合的准确率均尚未测得。

`tests/nutrition-transcription.test.mjs` 仅验证人工正确文字能否被 Parser 解析，不能证明 OCR 识图准确。旧提交 `7077f1a` 的 Parser 对这两段人工文字本来就能解析 10/10 核心字段，因此不能把修复后同样 10/10 说成图像识别率由低变高。新的基准可暴露原图 OCR 错字、裁剪收益、网络是否真正执行、以及融合冲突，但必须等待真实设备输出。

`ingredients/`、`date/`、`product/` 仅保留目录说明，本轮没有声称这些类别已有真实基准或完成验证。
