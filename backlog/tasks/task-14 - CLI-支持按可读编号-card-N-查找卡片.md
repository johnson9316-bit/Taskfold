---
id: TASK-14
title: CLI 支持按可读编号 card-N 查找卡片
status: To Do
assignee: []
created_date: '2026-09-24 12:33'
labels:
  - cli
dependencies: []
priority: low
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-5 遗留：卡片文件名是可读编号 card-N（16 分叉 C2），但 CLI 只接受 UUID 或其前缀，taskfold show card-1 返回 NOT_FOUND，list 也只显示 UUID 前缀。人和 AI 口头都会说 card-1，应支持按 card-N 查找，并在 list/show 输出里显示它。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 taskfold show/update/delete 接受 card-N
- [ ] #2 list 与 --json 输出包含可读编号
<!-- AC:END -->
