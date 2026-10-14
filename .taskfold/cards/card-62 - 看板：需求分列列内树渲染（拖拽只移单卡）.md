---
id: CARD-62
title: 看板：需求分列列内树渲染（拖拽只移单卡）
status: todo
assignee: []
created_date: '2026-10-14 10:38'
updated_date: '2026-10-14 10:46'
labels:
  - 子需求
milestone: 1e0b1780-39bc-4df1-b921-aba2c71b28c9
dependencies: []
priority: normal
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Taskfold

<!-- SECTION:TASKFOLD:BEGIN -->
{
  "uuid": "3b4fde93-1ef2-4942-99e4-809c211c8386",
  "position": 2000,
  "createdAt": 1791974339641,
  "notes": "来源：需求/24-子需求与子看板.md §四 P2（R3：列内树形缩进，拖拽只移动单卡）。\n\n## 范围（`packages/ui/src/pages/projects/project-view.ts`）\n\n1. `renderBoard` 的 requirement 分支：列 = 顶层需求（无 `contained_by` 的需求卡）；列内渲染子树——子需求及其下任务按层级缩进嵌套（Quire / Task Bundle 式）。\n2. 现有实现会把挂在需求下的子需求卡从列渲染中跳过（`isRequirementCard` 过滤），放开嵌套后要改为渲染。\n3. 拖拽只移动单卡：拖入某列 = 改挂该列顶层需求；拖入「未归属」= detach。不引入整捆 / Alt 拖拽。\n4. 子需求卡（挂在需求下的）在列内正常显示、可点开详情、可勾选完成。\n\n依赖：P1（store 放开）。\n验收：见 需求/24 第五节第 4 条。",
  "sourceReferences": [
    {
      "id": "3f8230ab-66fb-4b1b-aafb-37496071000c",
      "label": "设计文档：需求/24-子需求与子看板",
      "target": "./.taskfold/documents/需求/24-子需求与子看板.md",
      "position": 1000,
      "createdAt": 1791974794048,
      "updatedAt": 1791974794048
    }
  ],
  "metadata": {
    "automation": {
      "boardId": "flowboard"
    }
  }
}
<!-- SECTION:TASKFOLD:END -->
