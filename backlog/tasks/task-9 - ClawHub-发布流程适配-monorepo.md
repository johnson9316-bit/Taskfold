---
id: TASK-9
title: ClawHub 发布流程适配 monorepo
status: To Do
assignee: []
created_date: '2026-09-24 09:29'
updated_date: '2026-09-24 10:36'
labels:
  - release
milestone: m-0
dependencies:
  - TASK-1
  - TASK-11
references:
  - 需求/18-多宿主架构.md
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
按 18 §9 待验证：核实 docs/CLAW_HUB_PUBLISHING.md 与 package.json files 白名单在 workspaces 结构下如何发布 openclaw 包，并更新文档。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 npm run pack:check 在 openclaw 包下产物内容正确
- [ ] #2 发布文档已更新
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
依赖补上 TASK-11：插件迁到 packages/openclaw 之后才有「openclaw 包」可发布。
<!-- SECTION:NOTES:END -->
