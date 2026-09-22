# HuKang V1.3 扫描系统验证记录

## 已完成的自动验证

- TypeScript 检查通过。
- 16 项自动测试通过，包括条码规范化、5 种营养文字布局、标签类型自动判断、完整度判定、配料拆分、添加糖缺失保持 `null` 和日期计算。
- Android release 原生构建成功，内含 bundled Chinese ML Kit 模型。
- APK 对齐和 v2 签名校验成功。
- 包名 `com.hukang.local`，版本 `1.3.0`，versionCode `13`，最低 Android 7.0。
- APK 包含 `arm64-v8a` 与 `armeabi-v7a`。
- 最终 manifest 包含 Camera、Internet 与 Network State 权限。

## App 内诊断统计

隐藏开发者模式会累计：

- Barcode Detect Rate
- Local Product Hit Rate
- Online Product Hit Rate
- Photo Capture Success
- Photo Validate Success
- Local OCR Text Rate
- Nutrition Parse Rate
- Online Vision Fallback Success

进入方式：我的 → 关于护康 → 连续点击版本号 7 次。

## 仍需 Android 真机执行

构建时 ADB 没有发现已连接设备，因此不能把以下项目标记为通过：

- 相机预览、权限拒绝后恢复和前后台切换。
- 横拍、竖拍、倒置设备的图片方向。
- 连续拍摄 20 次的黑屏、0 KB、路径失效和闪退检查。
- 5 种中国预包装食品条码测试。
- 10 张真实食品包装照片的本地中文识别率。
- 5 张营养表、5 张配料表和 5 个包装日期。
- 使用有效 Provider 配置的联网图片增强。
- 创建商品后断网再次扫描同一条码。

这些项目必须以真机和真实包装数据记录，不能用文字样本或编译成功代替。

## 真机记录表

| 样本 | 条码 | 本地命中 | 在线命中 | 拍照 | 本地文字 | 结构化 | 联网兜底 | 失败原因 |
|---|---|---|---|---|---|---|---|---|
| 商品 1 | 待测 |  |  |  |  |  |  |  |
| 商品 2 | 待测 |  |  |  |  |  |  |  |
| 商品 3 | 待测 |  |  |  |  |  |  |  |
| 商品 4 | 待测 |  |  |  |  |  |  |  |
| 商品 5 | 待测 |  |  |  |  |  |  |  |
