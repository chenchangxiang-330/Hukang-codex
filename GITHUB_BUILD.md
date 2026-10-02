# GitHub Android 构建

目标仓库：https://github.com/chenchangxiang-330/Hukang-codex

源码已于2026-10-02正常推送到 `main`：迁移提交 `2393bd176e917a3e66462fa2e992e75a08903f0c`，已用GitHub API验证。原有规划文档和Git历史均保留。后续开发以该仓库为准；本地正式目录作为工作副本。云端APK构建尚未运行，签名Secret仍需配置。

源码包括已有 `android/`、手写中文 ML Kit 模块、Gradle Wrapper、锁文件、测试图片和交接文件。不要上传本机 SDK/JDK、node_modules、构建缓存、APK 或签名文件；不要运行 `expo prebuild --clean`。

## 签名

旧 APK 使用既有内测签名。`android/app/debug.keystore` 已被 Git 忽略，必须作为仓库 Actions Secret 保存，不可进入公开 Git 历史。

在 GitHub 仓库 Settings → Secrets and variables → Actions 中建立 `HUKANG_DEBUG_KEYSTORE_B64`，值为既有 keystore 的 Base64。无需在聊天、Issue 或日志中发送密钥。工作流验证签名文件哈希，缺少或不匹配时会停止，以免生成不能覆盖安装的 APK。

此签名只用于延续当前内测安装，不应作为正式商店发布密钥。

## 构建和下载

1. 源码提交到仓库后，在 Actions 中打开 `Build HuKang Android APK`。
2. 点击 `Run workflow`，选择包含最新修复的分支。
3. 云端安装 Java 17、Node 24、Android SDK 36 / NDK 27.1，执行类型检查和 Node 测试，再直接编译现有 Android 工程。npm 下载和 Gradle 依赖使用 Actions 缓存，无需上传本机缓存。
4. 运行成功后下载 `HuKang-OCR-Android-APK` artifact，解压获得 `app-release.apk`。产物默认保留 30 天，应另存需要保留的版本。

构建完成只证明原生编译和签名通过。中文营养表的原图/预处理 OCR、Vision 和融合字段准确率必须在安装新 APK 后按 `TEST_REPORT.md` 测量；无有效 Vision Key 时不能记为联网通过。

## 本地清理

可再生目录包括 `node_modules/`、`.expo/`、`dist/`、`android/.gradle/`、`android/build/`、`android/app/build/`、`android/app/.cxx/` 和工具链下载/Gradle 缓存。清理前确认没有正在运行的构建、已有源码备份并保留签名和需要的 APK。

`.build-tools` 可能包含真实 JDK、SDK 和签名，不是全部都是缓存；`android/` 包含源码，不能整目录删除。

## 2026-10-02 清理实录

旧工作区准确位置：`/Users/yangbing/.codex/.chatgpt-projects/g-p-6aa8fd4c70248191910c02f5e1e4ff04`。先用已有工具在正式源码中完成新版APK构建、验签并保存纯源码ZIP及完整Git bundle，确认无Gradle构建进程后，永久删除以下八个可再生目录：

- `.build-tools/gradle/caches`
- `.build-tools/gradle/wrapper`
- `.build-tools/downloads`
- `hukang/node_modules`
- `hukang/android/app/build`
- `hukang/android/app/.cxx`
- `hukang/android/.gradle`
- `hukang/android/build`

删除前目录占用统计合计 5,646,056 KiB（约5.38 GiB）；清理后磁盘可用空间增加约4.96 GiB。已确认八个目录不存在，正式源码Git干净、原生源码和wrapper保留、两处签名文件哈希未变；JDK/SDK保留约3.5 GiB。删掉的依赖和缓存可以按锁文件及Gradle重新生成，未移到废纸篓。

清理时本机Git尚未登录，先保留完整本地备份；之后用户完成CLI认证，源码已正常推送并核对远端SHA。原有源码和历史APK仍保留，未删除整个旧项目目录或整套JDK/SDK。
