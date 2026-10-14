---
id: CARD-65
title: boardView 升级多命名视图（子看板正式形态）
status: todo
assignee: []
created_date: '2026-10-14 10:38'
updated_date: '2026-10-14 10:46'
labels:
  - 子看板
milestone: 1e0b1780-39bc-4df1-b921-aba2c71b28c9
dependencies: []
priority: normal
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Taskfold

<!-- SECTION:TASKFOLD:BEGIN -->
{
  "uuid": "95460891-aee3-425b-9cbb-aa37a79c8e42",
  "position": 5000,
  "createdAt": 1791974339856,
  "notes": "来源：需求/24-子需求与子看板.md §四 P5（R1 「子看板」的正式形态）。\n\n## 范围\n\n1. `boardView` 升级为多命名视图：`views: [{ id, name, filter, groupBy, sortBy, sortDirection, layout }]` + `activeViewId`；每视图 = 过滤（含「某需求子树」维度）+ 分组 + 排序 + 布局（board/list）。\n2. 切换器进顶部控件区（TAPD 式多命名视图）。\n3. 持久化沿用 `boardView` 通道：OpenClaw 插件级 `projects.json`；VS Code `workspaceState`。\n4. 兼容：旧数据只有单份 `boardView` → 迁移为单个默认视图；评估 `normalizeBoardView` 读旧写新与格式版本门控（只丢偏好、不坏数据）。\n5. 链路：`packages/openclaw/src/backend/src/gateway-project-methods.ts`（boardView.update 扩参）、`packages/vscode/src/methods.ts`。\n6. 依赖 P1~P4 的树模型；可独立排期。\n\n验收：见 需求/24 第五节第 6 条（多视图部分）。",
  "sourceReferences": [
    {
      "id": "66e094d1-b0f3-4bb3-aa24-c732263e99f1",
      "label": "设计文档：需求/24-子需求与子看板",
      "target": "./.taskfold/documents/需求/24-子需求与子看板.md",
      "position": 1000,
      "createdAt": 1791974795404,
      "updatedAt": 1791974795404
    }
  ],
  "metadata": {
    "automation": {
      "boardId": "flowboard"
    }
  }
}
<!-- SECTION:TASKFOLD:END -->
