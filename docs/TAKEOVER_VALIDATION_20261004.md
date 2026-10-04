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

最近旧成功构建 run37116498494 已重读日志：源码 cc5bba9、114测试、BUILD SUCCESSFUL、安装 Success/启动 Status: ok、真实 ML Kit 定量守卫通过。报告中的 Downloads APK 路径不存在；原 GitHub APK 下载两次网络超时，正在改用连接器通道。该旧构建不验证本轮代码。

整合本轮 typecheck、126/126 Node 测试、脚本 bash -n、git diff --check PASS。Node 测试实际执行磁盘 SQLite 关闭重开、旧 V1.4 迁移、证据保存、NULL/0、基准、照片路径与关联约束；mock Vision 只验证选择/存储，没有真实联网请求。

本轮原生构建、安装、新运行标识实图回归、Android 杀进程/离线冷启动：等待提交后的 Actions 执行，完成后在此报告追加实际版本/结果；此时不能记为 PASS。

用户手机相机/图库/裁剪、显式选择 Vision、手动确认保存/编辑、库存和摄入、杀进程离线重启、配料/日期/条码：NOT TESTED。没有有效 Vision 服务或用户失败图，不判断模型准确率或手机错误根因，BUG-009 保持 OPEN。具体手机步骤及反馈要求见 [手机清单](./PHONE_ACCEPTANCE_20261004.md)。

保留本地源码、旧 APK、历史 ZIP/bundle 和签名，不安装 Mac Android/JDK 工具链，不 prebuild，不上传任何私钥或 API Key。最终 APK 源码 SHA 与之后仅报告提交的 SHA 分开记录。
