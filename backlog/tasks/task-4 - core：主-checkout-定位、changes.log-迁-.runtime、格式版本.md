---
id: TASK-4
title: core：主 checkout 定位、changes.log 迁 .runtime、格式版本
status: To Do
assignee: []
created_date: '2026-09-24 09:29'
labels:
  - core
  - storage
milestone: m-0
dependencies:
  - TASK-2
references:
  - 需求/18-多宿主架构.md
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
按 18 §3.6、§3.8、§3.9：PathResolver 用 git rev-parse --git-common-dir 定位主 checkout 的 .taskfold/；changes.log 移到 .taskfold/.runtime/changes.log 并在全局锁内追加；VS Code/CLI 不依赖 ~/.openclaw；.taskfold/config.yml 记录格式版本，core 遇更新的格式只读不写。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 在 git worktree 内调用 core，读写落到主 checkout 的 .taskfold/
- [ ] #2 两个进程各写一次，对方都能从 changes.log 感知到
- [ ] #3 config.yml 格式版本高于 core 时，写操作被拒并给出升级提示
<!-- AC:END -->
