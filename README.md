# 护康 HuKang V1.4

无登录、离线优先的 Android 食品营养与库存 App。核心数据存入本机 SQLite，健康档案存入 AsyncStorage，标签照片保存在 App 私有目录。网络只用于本地条码未命中时查询 Open Food Facts，以及用户明确同意后的可选在线图片识别；本地商品、摄入、库存和设备端 OCR 均可离线使用。

## 当前代码范围

以下能力已存在于代码中，但扫描、OCR、Vision 和在线候选尚未全部通过真机端到端验收。真实状态请先阅读 [`HANDOFF.md`](./HANDOFF.md)、[`BUGS.md`](./BUGS.md) 和 [`TEST_REPORT.md`](./TEST_REPORT.md)。

- 首次健康档案与多选目标
- 31 天每日营养历史；碳水、总糖、添加糖使用独立字段
- SQLite 商品、库存、营养快照日志
- 摄入修改/删除、来源明细和“如果吃下它”预测
- “扫一扫”拆分为商品条形码、拍商品、营养成分表、配料表、生产日期 / 保质期 5 个明确入口
- 每个扫描入口先展示简短的拍摄示意，再进入对应相机流程
- UPC/EAN 归一化、本地优先查询、1.8 秒重复扫描防抖及扫描震动
- 未知条码可查询 Open Food Facts，确认后缓存进 SQLite，随后可离线识别
- “拍商品”会保存真实图片，执行设备端文字识别，并在用户授权且配置识别服务后执行联网图片理解；随后用品牌、商品名、口味和规格查询候选商品
- 商品候选以条码为最高优先级，品牌、名称、口味和规格参与排序；确认后写入 SQLite
- 拍照后保存高分辨率原图和独立识别图到 App 稳定目录，并校验文件存在、大小、尺寸和方向
- 中文 ML Kit 设备端文字识别；营养表、配料表和日期使用各自独立的解析与结果状态
- 图片空文件、过暗、过曝、反光、模糊和尺寸检查
- 可选联网增强采用可替换 Provider；首次授权后可自动兜底，API Key 存入 Android 安全存储
- 普通页面隐藏内部错误码和开发配置；“关于护康”连续点击版本号 7 次才进入扫描诊断
- 扫描诊断记录照片、文件、方向、OCR、Vision、网络、候选结果和 UI 状态等关键事件
- 库存到期排序、开封状态及 7/3/1/当天本地通知
- JSON 数据导出和彻底清空

`added_sugar_g` 缺失时保存为 `NULL` 并显示“未记录”，不会根据碳水或总糖推算。

## 检查与构建

```bash
npm ci
npm run typecheck
npm test

export JAVA_HOME="$PWD/../.build-tools/java/Contents/Home"
export ANDROID_HOME="$PWD/../.build-tools/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export GRADLE_USER_HOME="$PWD/../.build-tools/gradle"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
export NODE_ENV=production
cd android && ./gradlew assembleRelease
```

请勿在未备份自定义文字识别原生模块时运行 `expo prebuild --clean`。原始构建产物位于 `android/app/build/outputs/apk/release/app-release.apk`。根目录交付文件 `HuKang-V1.4.apk`（同时保留兼容文件名 `HuKang-debug.apk`）是包含 JS 包的独立 APK，沿用本地测试签名。

连接开启 USB 调试的手机后安装：

```bash
adb install -r HuKang-V1.4.apk
```

包名 `com.hukang.local`；最低 Android 7.0（API 24）；支持 `arm64-v8a`、`armeabi-v7a`。

V1.4 扫描系统的验证范围和真机测试表见 [`SCAN_QA_V1.4.md`](./SCAN_QA_V1.4.md)。

当前最严重问题：用户真机拍摄商品或营养成分表后，会停在“正在准备照片…”并恢复相机，没有进入结果页。请先定位 capture → stable image → `onCapture` 链路，不要把代码存在视为功能已验收。
