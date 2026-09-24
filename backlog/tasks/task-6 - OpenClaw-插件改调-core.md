---
id: TASK-6
title: OpenClaw 插件改调 core
status: To Do
assignee: []
created_date: '2026-09-24 09:29'
labels:
  - openclaw
milestone: m-0
dependencies:
  - TASK-3
  - TASK-4
references:
  - 需求/18-多宿主架构.md
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
按 18 §7-3：工具、网关方法、执行调度全部改为依赖 core 包，执行状态走 core 的锁；projects.json 与 subscriptions 留在 OpenClaw 目录（18 §3.8）。现有功能不回退。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 现有单测全绿
- [ ] #2 本机 Gateway 实际加载后 Control UI 面板可用（按 AGENTS.md 的验证方法）
- [ ] #3 OpenClaw 与 CLI 同时写同一张卡，结果一致、无静默覆盖
<!-- AC:END -->
