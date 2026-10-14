---
id: CARD-66
title: 评审：子需求与子看板（R1~R4 定案）
status: done
assignee: []
created_date: '2026-10-14 10:46'
updated_date: '2026-10-14 10:50'
labels:
  - 子需求
  - 子看板
milestone: 1e0b1780-39bc-4df1-b921-aba2c71b28c9
dependencies: []
priority: normal
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Taskfold

<!-- SECTION:TASKFOLD:BEGIN -->
{
  "uuid": "ec844dfb-0373-4417-ad57-ea2d6573fab8",
  "position": 6000,
  "createdAt": 1791974767879,
  "notes": "来源：需求/24-子需求与子看板.md（本次评审与设计文档，已登记资料库 spec.subrequirements）。\n\n## 评审结论（2026-10-14 用户逐项拍板）\n- R1「子看板」形态 = 项目内多命名视图（社区普遍形态）；「点需求 → 聚焦其子树」作为视图过滤维度内嵌，不做独立全屏 drill\n- R2 嵌套深度 = 8 层硬限（对齐 GitHub）+ 防环校验\n- R3 看板列内 = 树形缩进渲染；拖拽只移动单卡（不做整捆 / Alt 语义）\n- R4 归档带子项的需求 = 推迟（已知边界记录在 24 §六）\n\n## 产出\n- 需求/24-子需求与子看板.md：调研结论 + R1~R4 + 数据模型 + P1~P5 实现分解 + 验收 + 已知边界\n- 8.9 卡片概述 §8 修订：两层限制 → 8 层（防环），指向 24\n- 需求/README 索引新增 24 行\n- 实施拆分为 card-61 ~ card-65（P1~P5，挂本里程碑）\n\n## 调研依据（摘要）\n- 视图不持有数据、板不嵌套实体（Quire 官方「数据不变、仅渲染」；Jira 板 = 过滤器投影）\n- 子看板社区普遍答案 = 多命名视图 + 过滤（TAPD 多看板 / GitHub Projects views / Linear custom views）\n- 深度无共识：Jira 1 层 / GitHub 8 层 / TAPD 不限；共同底线 = 防环 + 折叠\n\n## 约定（自本卡起）\n评审 / 设计类工作也进看板：先建评审卡 → 写文档 → 卡的「来源资料」挂文档，形成\"任务 → 文档\"可追溯链。\n\n验收：见 需求/24 第五节。",
  "sourceReferences": [
    {
      "id": "e02a15ba-aabe-4e74-afd1-a126d687fa6a",
      "label": "设计文档：需求/24-子需求与子看板",
      "target": "./.taskfold/documents/需求/24-子需求与子看板.md",
      "position": 1000,
      "createdAt": 1791974793126,
      "updatedAt": 1791975020743
    }
  ],
  "completedAt": 1791974770749,
  "metadata": {
    "automation": {
      "boardId": "flowboard"
    }
  }
}
<!-- SECTION:TASKFOLD:END -->
