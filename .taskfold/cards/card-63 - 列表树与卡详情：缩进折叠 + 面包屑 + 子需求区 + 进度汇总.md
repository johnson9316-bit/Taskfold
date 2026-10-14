---
id: CARD-63
title: 列表树与卡详情：缩进折叠 + 面包屑 + 子需求区 + 进度汇总
status: todo
assignee: []
created_date: '2026-10-14 10:38'
updated_date: '2026-10-14 10:46'
labels:
  - 子需求
milestone: 1e0b1780-39bc-4df1-b921-aba2c71b28c9
dependencies: []
priority: normal
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Taskfold

<!-- SECTION:TASKFOLD:BEGIN -->
{
  "uuid": "0d44f299-c5af-40d8-82fe-4c1c26a882d7",
  "position": 3000,
  "createdAt": 1791974339711,
  "notes": "来源：需求/24-子需求与子看板.md §四 P3。\n\n## 范围\n\n1. 列表视图（`boardView.layout = \"list\"`）：行按子树缩进 + 折叠；折叠状态为会话级 UI 状态，不落盘、不写 `boardView`。\n2. 卡片详情：\n   - 面包屑：沿 `contained_by` 链的祖先链（可点击跳转）；\n   - 「子需求」区：直接子项列表；\n   - 进度汇总：x/y（含后代）。\n3. 子树、面包屑、进度全部前端现算（不新增存储字段）。\n\n依赖：P1（store 放开）。\n验收：见 需求/24 第五节第 5 条。",
  "sourceReferences": [
    {
      "id": "827afec4-9125-4f70-bc00-b5971c64f5f9",
      "label": "设计文档：需求/24-子需求与子看板",
      "target": "./.taskfold/documents/需求/24-子需求与子看板.md",
      "position": 1000,
      "createdAt": 1791974794515,
      "updatedAt": 1791974794515
    }
  ],
  "metadata": {
    "automation": {
      "boardId": "flowboard"
    }
  }
}
<!-- SECTION:TASKFOLD:END -->
