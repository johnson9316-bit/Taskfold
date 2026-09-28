---
id: CARD-35
title: CLI 支持按可读编号 card-N 查找卡片
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
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Taskfold

<!-- SECTION:TASKFOLD:BEGIN -->
{
  "uuid": "2345e339-bccd-44b5-9def-c4ecffc1b25f",
  "position": 14000,
  "createdAt": 1790588986137,
  "notes": "已完成：CLI 支持按可读编号 card-N 查找卡片。\n\n实施范围：\nTASK-5 遗留：卡片文件名是可读编号 card-N（16 分叉 C2），但 CLI 只接受 UUID 或其前缀，taskfold show card-1 返回 NOT_FOUND，list 也只显示 UUID 前缀。人和 AI 口头都会说 card-1，应支持按 card-N 查找，并在 list/show 输出里显示它。\n\n验收记录：\n- [x] #1 taskfold show/update/delete 接受 card-N\n- [x] #2 list 与 --json 输出包含可读编号\n\n完成摘要：\nCLI 映射卡片文件名 card-N 与 UUID；show/update/delete 支持该编号，list/show 文本与 JSON 显示 displayId，合同测试通过。\n\n原任务：TASK-14\n来源：backlog/tasks/task-14 - CLI-支持按可读编号-card-N-查找卡片.md",
  "completedAt": 1790588986137,
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
