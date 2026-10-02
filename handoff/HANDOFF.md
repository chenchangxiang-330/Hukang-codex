# HANDOFF

> 2026-10-02 接续说明：本仓库已准备合入正式 HuKang Android 工程。此文件下方保留最初的规划交接；当前实现、P0 状态与真实测试证据统一见根目录 [HANDOFF.md](../HANDOFF.md)、[BUGS.md](../BUGS.md)、[TEST_REPORT.md](../TEST_REPORT.md) 和 [ARCHITECTURE.md](../ARCHITECTURE.md)。原生工程包含手写中文 ML Kit 模块，不需要重新创建项目。

## 项目

Hukang-codex

## 当前阶段

仅完成项目分类与基础产品文档。

**尚未开始业务代码开发。**

## 当前文档

- `docs/PRODUCT.md`：产品定义
- `docs/FEATURES.md`：功能分类
- `docs/UI_UX.md`：页面与交互
- `docs/RECOGNITION.md`：识别系统
- `docs/DATA_MODEL.md`：概念数据模型
- `docs/ROADMAP.md`：开发路线

## 开发前必须先确认

1. Android MVP 的具体技术栈
2. OCR 采用本地、云端还是混合方案
3. 条码商品数据源
4. 数据是否完全离线保存
5. 提醒机制
6. 第一版明确不做哪些功能

## 约束

- 不虚构已经实现的功能
- 不把“规划”写成“已完成”
- 不把联网搜索写成已可用，除非真实测试通过
- OCR 结果必须允许用户确认 / 修改
- 重要决策同步更新本文件

## 下一步

下一阶段建议先做技术选型与 MVP 数据流设计，确认后再创建代码目录。
