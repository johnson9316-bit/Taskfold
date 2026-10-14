---
id: CARD-70
title: 归档需求的看板列策略（灰显列 vs 子项移入未归属）
status: backlog
assignee: []
created_date: '2026-10-14 10:50'
updated_date: '2026-10-14 10:50'
labels:
  - 子需求
milestone: 1e0b1780-39bc-4df1-b921-aba2c71b28c9
dependencies: []
priority: normal
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Taskfold

<!-- SECTION:TASKFOLD:BEGIN -->
{
  "uuid": "d2fcbcbf-fa9d-4c82-9e34-c5c4fc46f8a8",
  "position": 7000,
  "createdAt": 1791975012461,
  "notes": "来源：需求/24-子需求与子看板.md §六（R4 推迟项，评审时明确「留后续卡决定」）。\n\n## 背景\n归档需求卡（kind=requirement）后，其未归档子项在「按需求分列」中不可见——这是两层模型就存在的既有行为（归档卡被从看板过滤）。子需求放开（P1/P2）后问题放大：归档一个需求，整棵子树可能从列里消失。\n\n## 选项（24 §六已列）\n1. 灰显列：归档需求的列保留（默认收起），子项继续可见；\n2. 子项移入「未归属」：归属信息丢失。\n\n## 依赖\nP1（store 放开，card-61）、P2（列内树，card-62）落地后再定——列内渲染形态会变，策略需对着新形态定。\n\n## 验收\n- 定案写入需求/24（修订 §六缺失段）；\n- 归档含子项的需求后，子项在看板「按需求分列」中有明确可见的去处。",
  "metadata": {
    "automation": {
      "boardId": "flowboard"
    }
  }
}
<!-- SECTION:TASKFOLD:END -->
