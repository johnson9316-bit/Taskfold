---
id: TASK-4
title: core：主 checkout 定位、changes.log 迁 .runtime、格式版本
status: Done
assignee: []
created_date: '2026-09-24 09:29'
updated_date: '2026-09-24 11:16'
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
- [x] #1 在 git worktree 内调用 core，读写落到主 checkout 的 .taskfold/
- [x] #2 两个进程各写一次，对方都能从 changes.log 感知到
- [x] #3 config.yml 格式版本高于 core 时，写操作被拒并给出升级提示
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
承接 18 §3.3 表第 6 行：store-change-tracker.ts:18,85-127 的内存 listener 与 store-core.ts:216-238 的 waitForChange，改由 ChangeSource 端口驱动（跨进程靠 .runtime/changes.log）；并入 change-events.ts:4,18 的 1 秒轮询。

TASK-2 遗留：changes.log 目前在 pluginDir、多项目共享，而全局锁按项目 dataDir 分，多项目并发 reserveFileChangeRevisions 仍可能冲突——迁到 .taskfold/.runtime/ 后随之解决，验收时要覆盖这一点。

2026-09-24 暂停：子代理开工后即被叫停，工作树无代码改动。重启时先查清 change cursor（changes.wait，browser/project-host.ts:204）是跨项目全局游标还是按项目游标——若是全局，changes.log 按项目拆分会改变游标语义，须先定方案再做。

2026-09-24 定案（变更游标）：采用「适配层聚合游标」。每个项目一份 .taskfold/.runtime/changes.log（全局锁内追加 epoch/reserve 记录），core 只提供按项目的 ChangeSource；OpenClaw 适配层的 taskfold.changes.wait 聚合所有已注册项目：适配层自有 epoch（Gateway 进程级）+ 单调计数，任一项目 changes.log 前进即 +1，返回形状不变，前端零改动。未采用：changes.wait 按项目等（要改前端与网关契约）；项目内 + ~/.openclaw 全局双写（违反 18 §3.8）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
PathResolver（file-store-path-resolver.ts）按 git common dir 把 dataDir 映射到主 checkout，非 git 原样回退，bare/submodule 按当前 worktree。changes.log 移到各项目 .taskfold/.runtime/，每次写入在项目全局锁内追加，超 1000 行压缩；多项目并发 reserve 冲突随之解决。新增 ChangeSource 端口：SQLite 原样沿用块预留，文件后端靠日志跨进程感知；适配层 change-aggregator.ts 聚合游标，changes.wait 返回形状不变、前端零改动。config.yml 键名用 format_version（与 task_prefix 等 snake_case 一致，16 草案写的 schemaVersion 未采用），更新则只读、写入报升级提示。AC#2、多项目 reserve 先红后绿；npm test 325 通过/4 跳过，typecheck、check:public-names 通过。
<!-- SECTION:FINAL_SUMMARY:END -->
