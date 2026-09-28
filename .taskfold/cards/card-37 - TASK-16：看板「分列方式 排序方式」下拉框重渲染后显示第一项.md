---
id: CARD-37
title: 看板「分列方式/排序方式」下拉框重渲染后显示第一项
status: done
assignee: []
created_date: '2026-09-28 09:49'
updated_date: '2026-09-28 09:56'
labels:
  - 历史任务
  - 多宿主
milestone: dc058a67-122f-4981-908e-188e515837a8
dependencies: []
priority: low
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Taskfold

<!-- SECTION:TASKFOLD:BEGIN -->
{
  "uuid": "19eff2ae-1ebc-45cf-978d-6c9bea07f4a2",
  "position": 16000,
  "createdAt": 1790588989156,
  "notes": "已完成：看板「分列方式/排序方式」下拉框重渲染后显示第一项。\n\n实施范围：\nTASK-8b 发现的既有问题（OpenClaw 与 VS Code 共用代码）：看板重新渲染后，分列方式、排序方式两个 <select> 显示第一项，与实际分组不一致——select 的 value 在 option 渲染前就设置了（browser/pages/projects/project-view.ts）。\n\n完成摘要：\n修正两个下拉框 option 的 selected 状态；共享前端实际浏览器验证 status/updatedAt/desc 重渲染后显示正确。\n\n原任务：TASK-16\n来源：backlog/tasks/task-16 - 看板「分列方式-排序方式」下拉框重渲染后显示第一项.md",
  "completedAt": 1790588989156,
  "metadata": {
    "automation": {
      "boardId": "flowboard",
      "workspace": {
        "kind": "dir",
        "path": "./"
      },
      "workspaceAccess": {
        "unrestricted": true
      }
    }
  }
}
<!-- SECTION:TASKFOLD:END -->
