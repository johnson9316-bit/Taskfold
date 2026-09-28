---
id: CARD-25
title: core：主 checkout 定位、changes.log 迁 .runtime、格式版本
status: done
assignee: []
created_date: '2026-09-28 09:49'
updated_date: '2026-09-28 09:56'
labels:
  - 历史任务
  - 多宿主
milestone: dc058a67-122f-4981-908e-188e515837a8
dependencies: []
priority: normal
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Taskfold

<!-- SECTION:TASKFOLD:BEGIN -->
{
  "uuid": "1e40d8d3-91dd-47e2-8a6f-46b757bea718",
  "position": 4000,
  "createdAt": 1790588970955,
  "notes": "已完成：core：主 checkout 定位、changes.log 迁 .runtime、格式版本。\n\n实施范围：\n按 18 §3.6、§3.8、§3.9：PathResolver 用 git rev-parse --git-common-dir 定位主 checkout 的 .taskfold/；changes.log 移到 .taskfold/.runtime/changes.log 并在全局锁内追加；VS Code/CLI 不依赖 ~/.openclaw；.taskfold/config.yml 记录格式版本，core 遇更新的格式只读不写。\n\n验收记录：\n- [x] #1 在 git worktree 内调用 core，读写落到主 checkout 的 .taskfold/\n- [x] #2 两个进程各写一次，对方都能从 changes.log 感知到\n- [x] #3 config.yml 格式版本高于 core 时，写操作被拒并给出升级提示\n\n完成摘要：\nPathResolver（file-store-path-resolver.ts）按 git common dir 把 dataDir 映射到主 checkout，非 git 原样回退，bare/submodule 按当前 worktree。changes.log 移到各项目 .taskfold/.runtime/，每次写入在项目全局锁内追加，超 1000 行压缩；多项目并发 reserve 冲突随之解决。新增 ChangeSource 端口：SQLite 原样沿用块预留，文件后端靠日志跨进程感知；适配层 change-aggregator.ts 聚合游标，changes.wait 返回形状不变、前端零改动。config.yml 键名用 format_version（与 task_prefix 等 snake_case 一致，16 草案写的 schemaVersion 未采用），更新则只读、写入报升级提示。AC#2、多项目 reserve 先红后绿；npm test 325 通过/4 跳过，typecheck、check:public-names 通过。\n\n原任务：TASK-4\n来源：backlog/tasks/task-4 - core：主-checkout-定位、changes.log-迁-.runtime、格式版本.md",
  "completedAt": 1790588970955,
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
