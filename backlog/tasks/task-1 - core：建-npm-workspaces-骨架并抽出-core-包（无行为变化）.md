---
id: TASK-1
title: core：建 npm workspaces 骨架并抽出 core 包（无行为变化）
status: To Do
assignee: []
created_date: '2026-09-24 09:29'
labels:
  - core
  - refactor
milestone: m-0
dependencies: []
references:
  - 需求/18-多宿主架构.md
priority: high
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
按 18 §3.1、§7-1：建 npm workspaces（core/cli/openclaw/vscode 四个包位），把可搬的领域与存储模块移入 core；只借了 SDK 纯工具函数的几处（store-workflow.ts:13-15 等）换本地实现；resolveStateDir 改为调用方注入。本任务只做搬迁，不改行为，不加锁。执行状态代码原样搬（18 §3.2）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 core 包不依赖 openclaw / openclaw/*（grep 为零）
- [ ] #2 现有单测全绿、typecheck 通过、npm run build 产物可被本机 Gateway 加载
- [ ] #3 npm run check:public-names 通过
<!-- AC:END -->
