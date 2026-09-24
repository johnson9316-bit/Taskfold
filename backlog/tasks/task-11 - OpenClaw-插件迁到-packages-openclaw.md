---
id: TASK-11
title: OpenClaw 插件迁到 packages/openclaw
status: To Do
assignee: []
created_date: '2026-09-24 10:36'
labels:
  - openclaw
  - refactor
milestone: m-0
dependencies:
  - TASK-6
references:
  - 需求/18-多宿主架构.md
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-1 为免改全局配置把插件留在仓库根；本任务把 openclaw.plugin.json、适配层 src/backend、Control UI 构建与 dist 迁到 packages/openclaw，根目录只做 workspaces 根。需同步修改 ~/.openclaw/openclaw.json 的 plugins.load.paths —— 这是全局配置，动手前须征得用户确认，并记录回滚方法。AGENTS.md 里的本机路径说明随之更新。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Gateway 从新路径加载 taskfold：inspect --runtime 为 loaded，工具数不变
- [ ] #2 npm test / typecheck / build / check:public-names 通过
- [ ] #3 AGENTS.md 的加载路径与验证方法已更新
<!-- AC:END -->
