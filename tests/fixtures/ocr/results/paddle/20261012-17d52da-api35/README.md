# 本次 Android35 实际候选执行（2026-10-12）

源码17d52da65733741956576db3ae397725e8237d90，[云run38186191792](https://github.com/chenchangxiang-330/Hukang-codex/actions/runs/38186191792/job/114609884841)，Android35/x86_64，读取同目录之外仓库既有的两张公开JPG及固定人工ROI。五核心字段共10项。

- `ocr-regression.json`/`ocr-regression-paddle.json` 是此job真正读图得到的原始执行JSON；原文、行框、几何重排输入、实际图片hash、原生时间/内存/模型身份保留。文件URI对应已结束的云模拟器，不是可用于本机访问的路径。
- 两个`ocr-score*.json`为本次原始执行之后的Node评分；GT只在评分端。ML Kit生产7正确/0错/3缺；Paddle原图8/0/2，ROI和生产融合10/0/0。原图中的牛奶脂肪/钠行配对仍缺失；不能把ROI成绩写成原图成绩。
- `paddle-default-gate.json`只证明显式候选门槛，此版本默认仍ML Kit，没有普通默认Paddle probe。
- `storage-summary.json`保留原始write151/verify27检查名和结果、runId、buildInfo、网络及不同launchToken；省去合成业务快照。真实公开OCR产品和合成/mock Vision业务材料分别执行，不能说用户触摸确认或真实Vision服务已经运行。
- API24 job卡在启动器解锁步骤后因45分钟上限取消，无App执行或OCR证据；该项未通过。整个run结论cancelled不覆盖独立Android35 job的已完成结果。

云原始证据ZIP artifact11720370553，SHA256 ab736e805100ac77aa6296581a800f87570b89a02b999337b2788ca234f28787。结果文件仅来自公开fixture与云端合成测试数据，没有用户私人照片。不能作为后续版本的实际重新执行；最新默认版必须新build/new runId。
