# 2026-10-04 接手修复与验证

来源：从 GitHub 新克隆 `main`；本地正式副本和远端均为交接 `6194e8fc0ad3c1a482b0b8ca37e7752ce73daad3`，无后续提交、无未提交工作。按顺序实际读过 docs/HANDOFF、BUGS/TEST_REPORT、ARCHITECTURE/GITHUB_BUILD、识别审计、fixtures README 与三份 results JSON。中断后再次核对 Git 状态并保留全部修改。

## 本轮代码

- 营养确认选择 Vision 时，`ocrRawText` 仍来自未改写本地 OCR；原图/ROI 和 Vision 结构分开保存到新增 nullable `recognition_evidence_json`。选择只决定候选值，不替换原文。旧库幂等 ALTER，不重建或删除数据。
- 编辑既有商品载入完整原记录；没有新识别时保留 OCR 原文、来源和独立证据。载入完成前禁止保存，避免保存空草稿。相关逻辑由确认页和表单实际共用的两个小函数负责，没有重构整个保存流程。
- OCR 脚本先归档前次结果，再带本次唯一 runId 启动。文件必须对应此次 runId、completed 状态和顺序有效的开始/完成时间，并保留真实图片执行/定量守卫。原始历史 JSON 未改写。
- 新增 cloud Debug 专用两阶段存储回归，调用真实 expo-sqlite / AsyncStorage / File 生产接口；外部脚本 force-stop、断网、冷启动后精确比较商品、库存、摄入、照片、档案和扫描偏好。仅追加唯一测试数据；不清数据库，不覆盖非默认用户档案/偏好。
- 诊断显示/导出准确源码 SHA 与 Android 设备信息；CI 在打包前写入构建标识，设备配置密钥不进入该标识或诊断。
- 补充四项非默认 OCR 对照：同一次有界解码后的全图 PNG、ROI PNG、同像素 ROI JPEG97、10% padding ROI PNG。目的是隔离裁剪上下文与新增 JPEG 编码影响，实验不进入生产候选。真实云结果须单独报告，不能将 mock 编排测试当识图改善。
- 三批低风险清理及逐项依据见 [精简报告](./CODE_CLEANUP_20261004.md)：旧 Mine、旧 storage.ts、23 个无消费样式和无用导入。model.ts、诊断、fixtures、所有依赖、原生注册保留。

## 已执行与待执行

接手基线 typecheck、114/114 测试、三份原始记录独立复算通过。原始融合基线 1正确/0错误/9缺失；交接最终生产候选 7正确/0错误/3缺失，均只有两张营养图10字段。牛奶3个小数值尚未可靠读取，Vision 两图均 not_run / CI_NO_VISION_KEY。复算是回放证据，不是新图像执行。

最近旧成功构建 run37116498494 已重读日志：源码 cc5bba9、114测试、BUILD SUCCESSFUL、安装 Success/启动 Status: ok、真实 ML Kit 定量守卫通过。报告中的 Downloads APK 路径不存在；原 GitHub APK 下载两次网络超时，已改用连接器通道下载并核验，保存在 `测试包/20261004-cc5bba9/`。旧包135335951 bytes，SHA256 `0f711dfcdee835223a6d9ef68c7f22f8513305281371970e6b32159440a52782`，不能套用a49e85d的hash。该旧构建不验证本轮代码。

整合本轮 typecheck、126/126 Node 测试、脚本 bash -n、git diff --check PASS。Node 测试实际执行磁盘 SQLite 关闭重开、旧 V1.4 迁移、证据保存、NULL/0、基准、照片路径与关联约束；mock Vision 只验证选择/存储，没有真实联网请求。

本轮首个run37194216228（5e2f879）原生编译/签名、安装和启动通过，但 `adb logcat -d` 退出255，脚本尚未拉取OCR JSON便退出，存储未执行；不计为完整验收。改为先读取/校验核心JSON，再以超时和单独错误文件采集日志/截图；必要结果失败仍会使job失败。新增两项fake-ADB控制流测试（不作为识图证据），typecheck、128/128 Node、bash -n、diff --check全部通过。

用户手机相机/图库/裁剪、显式选择 Vision、手动确认保存/编辑、库存和摄入、杀进程离线重启、配料/日期/条码：NOT TESTED。没有有效 Vision 服务或用户失败图，不判断模型准确率或手机错误根因，BUG-009 保持 OPEN。具体手机步骤及反馈要求见 [手机清单](./PHONE_ACCEPTANCE_20261004.md)。

保留本地源码、旧 APK、历史 ZIP/bundle 和签名，不安装 Mac Android/JDK 工具链，不 prebuild，不上传任何私钥或 API Key。最终 APK 源码 SHA 与之后仅报告提交的 SHA 分开记录。

## 最终云端验证与安装包

- 应用/测试脚本源码：`bb2dd46662fa939afcd3326b53f4a89513a23e1a`。 [run37197334844](https://github.com/chenchangxiang-330/Hukang-codex/actions/runs/37197334844) 两job SUCCESS；云128测试、原生BUILD SUCCESSFUL、签名检查、安装Success及独立冷启动Status: ok通过。之后仅报告/原始证据提交不改变APK源码，提交号分开。
- 本次真实OCR标识 `ocr-1791112176-3234` 已校验，生产候选仍7正确/0错填/3缺失、两基准正确、无不可见字段补造；原图7/1/2、ROI4/1/5。四个新实验全图PNG7/1/2、ROI PNG6/1/3、同像素ROI JPEG97 4/1/5、padding PNG5/2/3；未解决牛奶三字段，不更换生产默认。Vision未实际运行。
- Android真实生产存储接口：write 65项、force-stop后飞行模式/Wi-Fi及移动数据关闭、verify 18项PASS。实际NetInfo离线，PID 5178→5342；OCR原文、独立原图/ROI/mock Vision、来源、125mL基准、NULL/0、测试标记PNG文件、商品/库存/摄入关系、数量/日期、档案偏好一致。该测试模拟Vision选项并使用实际共享保存helper，未发送Vision请求、未执行用户触摸确认。文件持久化仅用1×1测试PNG，真实包装照片和用户Android旧库升级未验收；旧库迁移仅在Node SQLite已测。
- [原始执行记录与截图](./evidence/20261004-bb2dd46/README.md) 原字节入库附hash；新run启动/离线验证截图已人工查看，启动crash与诊断采集错误文件均为空。
- [APK artifact11301805339](https://github.com/chenchangxiang-330/Hukang-codex/actions/runs/37197334844/artifacts/11301805339)，有效期至2026-11-03。本地永久保留于 `/Users/yangbing/Ai/open ai/我开发的app/护康/测试包/20261004-bb2dd46/HuKang-cloud-debug.apk`，135358111 bytes；SHA256 `1d401b22a76712d18e660679121c543e29be14470e81b09f4b02d9dac5e800f2` 与云一致；解包内置bundle实际含bb2dd46完整SHA。
- 包名 `com.hukang.local.clouddebug`，1.4.0-clouddebug / versionCode 14，arm64-v8a真机及x86_64模拟器，临时测试签名；不依赖Metro，不支持仅32位设备。与旧正式包可并存；旧云包若签名冲突，先导出数据并由用户决定处理。
- 独立证据新JSON列本轮只接入营养确认；配料/日期远程原文仍在诊断，尚未全部持久化到此列。没有宣称四入口证据已全部入库。
- 本地正式源码可快进同步；两个旧APK、ZIP/bundle及debug.keystore的大小和SHA256与同步前逐一一致。无用户密钥或签名私钥提交。
