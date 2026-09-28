---
id: CARD-19
title: BUG：跨项目移动未要求选择目标里程碑
status: done
assignee: []
created_date: '2026-07-29 03:48'
updated_date: '2026-07-30 07:00'
labels: []
milestone: b56a1f5f-2d72-4371-9373-9c837cc3d52f
dependencies: []
priority: high
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Taskfold

<!-- SECTION:TASKFOLD:BEGIN -->
{
  "uuid": "dc408ff2-2ca6-4f3c-8852-b1abee597653",
  "position": 5000,
  "createdAt": 1785296903670,
  "notes": "复现：打开卡片详情，Move to project 只提供项目选择；确认后现有 UI 调用 moveProject 时不提供 milestoneId。预期：选择目标项目后必须选择该项目的 active milestone，已归档项目和已完成/归档里程碑不可选。",
  "completedAt": 1785297979467,
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
