# Android 本地环境精准清理记录

日期：2026-10-03（Asia/Shanghai）。用户决定改为GitHub云端开发/编译，并明确不需要SDK/JDK及缓存的恢复备份。

## 实际清理

以下仅删除已验证的第三方工具和生成目录，没有删除整个工作区、android源码目录或node_modules依赖目录。

旧工具链根目录：`/Users/yangbing/.codex/.chatgpt-projects/g-p-6aa8fd4c70248191910c02f5e1e4ff04/.build-tools`。

| 实际永久删除目标 | 删除前占用 KiB |
| --- | ---: |
| 旧工具链 `android-sdk/`，含NDK27.1、SDK36、build-tools35/36、platform-tools、CMake、命令行工具 | 3,357,496 |
| 旧工具链 `java/`，Azul JDK17 | 320,700 |
| 旧工具链 `gradle/` | 6,152 |
| 旧工具链 `logs/` | 128 |
| 旧工具链 `env.sh` | 4 |
| `/Users/yangbing/.android/`，仅analytics配置 | 4 |
| `/Users/yangbing/Library/Android/`，空目录 | 0 |

正式源码根目录：`/Users/yangbing/Ai/open ai/我开发的app/护康/内测/2.0/HuKang`。下列路径相对于这个根目录，删除前均无tracked文件、APK、AAB、keystore或Wrapper。

| 实际永久删除目标 | 删除前占用 KiB |
| --- | ---: |
| `android/.gradle/` | 26,128 |
| `android/app/.cxx/` | 22,996 |
| `android/build/` | 184 |
| `android/app/build/generated/` | 8,180 |
| `android/app/build/intermediates/` | 992,068 |
| `android/app/build/kotlin/` | 732 |
| `android/app/build/kotlinToolingMetadata/` | 4 |
| `android/app/build/tmp/` | 152 |
| `node_modules/react-native-safe-area-context/android/build/` | 10,696 |
| `node_modules/@react-native-community/netinfo/android/build/` | 9,356 |
| `node_modules/expo/node_modules/@expo/log-box/android/build/` | 35,712 |
| `node_modules/expo/android/build/` | 48,412 |
| `node_modules/expo-constants/android/build/` | 1,300 |
| `node_modules/expo-modules-core/android/.cxx/` | 209,060 |
| `node_modules/expo-modules-core/android/build/` | 478,192 |
| `node_modules/@react-native-async-storage/async-storage/android/build/` | 9,460 |

合计23个准确路径，删除前目录占用5,537,116 KiB，约5.67GB（5.28GiB）。这些工具/缓存没有制作新备份，永久删除后只能重新下载或构建。此前恢复目录在接续检查时已不存在；Desktop、iCloud Desktop和废纸篓没有 `Android-local-cleanup-recovery-*`，没有后台归档进程。

## 实测磁盘空间

紧邻本轮删除前后的 `/System/Volumes/Data` 可用空间：

- 清理前：97,200,000 KiB，约99.53GB。
- 清理后：102,400,000 KiB，约104.86GB。
- 实测增加：5,200,000 KiB，约5.32GB（4.96GiB）。

目录占用合计和磁盘可用增量不是相同指标；文件系统分配和其他后台活动会影响读数。不把上一轮外部清理或此前缓存清理合并为本轮释放量。

## 保留与验证

- VS Code1.138.0、Node24.20.0、npm/npx11.19.0、Git2.54.0、gh2.102.0保留且版本检查通过。
- `gh auth status`确认账号chenchangxiang-330仍通过keyring登录，HTTPS配置未改变。未修改Git/gh配置文件或登录凭据。
- macOS Java stub、`/usr/libexec/java_home`、Xcode Command Line Tools保留。
- `~/.gradle/`20KiB只有代理配置及历史副本，不是构建缓存，用途不只限本项目，因此保留。系统JDK安装收据亦保留。
- Android Studio及其常规残留没有找到；Emulator、AVD和system images没有找到，未虚报删除。
- 旧工具链根目录只剩应保留的 `hukang-v1-signing.keystore`。正式项目签名原件也保留，两者SHA256与清理前一致；未上传签名、私钥或凭据。
- 清理前后正式项目源码digest一致，Git工作区干净。之后另以独立提交完成用户要求的云端Debug配置，业务OCR代码未改。
- 10个现存APK均存在且非空，正式项目的 `android/app/build/outputs/apk/release/app-release.apk`保留。`gradlew`、`gradlew.bat`、Wrapper和手写原生模块保留。

## Terminal 修复

报错来源是 `.zshrc` 中执行 `/usr/libexec/java_home -v 17` 的失效JAVA_HOME设置。仅精准移除了该行及4条相关Android/JDK变量和PATH行，其余配置保留。新建交互登录zsh只输出验证标识，不再出现“Unable to locate a Java Runtime”。不要求本机第三方Java仍能运行。

## 本地项目删除边界

本地HuKang仍保留。GitHub纯净克隆已经核对完整源码、资产、真实测试图片、ground truth、脚本、文档、设计资源及原生工程，没有遗漏LFS/子模块。云端Debug不需要本地签名，具体构建/安装证据见 `GITHUB_BUILD.md` 与 `TEST_REPORT.md`。

整个本地项目目录还包含Git忽略的旧签名、APK、源码ZIP和Git bundle。它们不能通过源码克隆恢复，且用户要求保留。删除整个目录前应先另存这些文件；云端模拟器安装不等于用户手机安装或真实OCR验收。本次没有删除本地项目目录。
