# GitHub Android Debug 构建

目标仓库：https://github.com/chenchangxiang-330/Hukang-codex

源码已于2026-10-02正常推送到 `main`，原有规划文档和Git历史均保留。2026-10-03 已从GitHub纯净克隆核对全部124个提交文件及执行权限。后续开发以该仓库为准；本地正式目录暂时保留。当前工作流改为无需现有密钥的云端 Debug，首轮云端构建及安装结果仍待实际运行确认。

源码包括已有 `android/`、手写中文 ML Kit 模块、Gradle Wrapper、锁文件、测试图片和交接文件。不要上传本机 SDK/JDK、node_modules、构建缓存、APK 或签名文件；不要运行 `expo prebuild --clean`。

## 测试签名与安装

用户要求不上传任何现有签名私钥、keystore 或敏感凭据。工作流不引用签名 Secret，每次在临时 runner 新生成测试 Debug 签名，私钥不缓存、不上传，runner 结束后销毁。APK artifact 仅含APK、校验值和源码提交标识。

云端包名是 `com.hukang.local.clouddebug`，版本后缀 `-clouddebug`，可以与旧 `com.hukang.local` 同时安装；旧App数据不会迁移到这个测试包。云端 Debug 包已强制内置JS，并关闭对Metro开发服务器的依赖。

每次构建签名不同，之后测试新包可能需要先卸载**云测试版**再安装，新包不会覆盖旧护康。本次APK包含 `arm64-v8a`（64位Android真机）和 `x86_64`（云端模拟器）；不支持仅32位的旧手机。旧签名文件仍只保存在本地，不是可再生缓存，不可随源码目录删除。

## 构建和下载

1. `main` 上源代码、资源、构建配置或测试脚本变更自动触发 `Build HuKang Android Debug APK`；仅文档修改不触发。也可在Actions点击 `Run workflow` 手动构建 `main`。
2. runner 按锁文件执行 `npm ci`、类型检查和Node测试，安装Java17、SDK36 / NDK27.1，直接编译已有原生工程，不运行prebuild。
3. `assembleDebug -PcloudDebugBuild=true -PreactNativeArchitectures=arm64-v8a,x86_64` 生成独立测试APK；校验签名和内置JS。
4. 第二个job下载同一APK，在Android35模拟器安装、启动，检查App进程和实际中文页面，保存安装日志、截图、UI和崩溃日志。这是安装/启动验证，不等于用户真机OCR验收。
5. 运行成功后下载 `HuKang-Cloud-Debug-APK` artifact，解压获得 `HuKang-cloud-debug.apk`；在手机文件管理器点击并允许该来源安装。产物保留30天，需要的APK应另存。`HuKang-Debug-Install-Evidence` 是云端安装证据。

构建与模拟器安装完成只证明编译、下载、安装和启动。中文营养表的原图/预处理OCR、Vision和融合字段准确率仍须在真机按 `TEST_REPORT.md` 测量；无有效Vision Key不能记为联网通过。

## 本地清理

可再生目录包括 `node_modules/`、`.expo/`、`dist/`、`android/.gradle/`、`android/build/`、`android/app/build/`、`android/app/.cxx/` 和工具链下载/Gradle 缓存。清理前确认没有正在运行的构建、已有源码备份并保留签名和需要的 APK。

`.build-tools` 可能包含真实 JDK、SDK 和签名，不是全部都是缓存；`android/` 包含源码，不能整目录删除。

2026-10-03 用户明确不需要开发工具恢复备份。旧隐藏工具链SDK/JDK/NDK及确定的Android生成缓存已精准永久清理，无新恢复包；保留源码、Wrapper、签名及10份现存APK。目录占用统计约5.67GB，删除前后磁盘可用空间实测增加5.32GB（4.96GiB）。`.zshrc`仅移除5条失效Java/Android设置，新Terminal不再自动报Java Runtime错误。Node、npm、Git、gh和VSCode仍在。

整个本地HuKang目录尚不能直接删除：它含没有提交到GitHub的旧签名、APK以及本地ZIP/bundle。即使云端构建安装通过，先保留这些不可由源码克隆恢复的文件；真机安装尚未验收时也不能宣称已经通过。

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
