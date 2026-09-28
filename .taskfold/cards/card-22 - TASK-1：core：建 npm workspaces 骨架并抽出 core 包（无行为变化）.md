---
id: CARD-22
title: core：建 npm workspaces 骨架并抽出 core 包（无行为变化）
status: done
assignee: []
created_date: '2026-09-28 09:49'
updated_date: '2026-09-28 09:56'
labels:
  - 历史任务
  - 多宿主
milestone: dc058a67-122f-4981-908e-188e515837a8
dependencies: []
priority: high
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Taskfold

<!-- SECTION:TASKFOLD:BEGIN -->
{
  "uuid": "586a3bb1-2f41-4632-8a8e-c3bfb3fb18c4",
  "position": 1000,
  "createdAt": 1790588966417,
  "notes": "已完成：core：建 npm workspaces 骨架并抽出 core 包（无行为变化）。\n\n实施范围：\n按 18 §3.1、§7-1：建 npm workspaces（core/cli/openclaw/vscode 四个包位），把可搬的领域与存储模块移入 core；只借了 SDK 纯工具函数的几处（store-workflow.ts:13-15 等）换本地实现；resolveStateDir 改为调用方注入。本任务只做搬迁，不改行为，不加锁。执行状态代码原样搬（18 §3.2）。\n\n验收记录：\n- [x] #1 core 包不依赖 openclaw / openclaw/*（grep 为零）\n- [x] #2 现有单测全绿、typecheck 通过、npm run build 产物可被本机 Gateway 加载\n- [x] #3 npm run check:public-names 通过\n\n完成摘要：\n36 个模块 git mv 进 packages/core（@taskfold/core），SDK 纯工具函数换为 sdk-utils.ts 本地实现（差分测试比对等价），resolveStateDir 改注入。store.ts/sqlite-store.ts（含 dispatch）与 project-document-reader.ts 留在适配层；src/contract/index.ts 留转发文件供 browser 引用，TASK-8 改前端引用后删除。npm test 296 个前后一致（3 个 e2e control-ui-baseline 失败为既有问题：断言写死 4 个项目，真实数据是 5 个）。Gateway 重启后 loaded、43 个工具注册、taskfold.projects.list 正常。\n\n原任务：TASK-1\n来源：backlog/tasks/task-1 - core：建-npm-workspaces-骨架并抽出-core-包（无行为变化）.md",
  "completedAt": 1790588966417,
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
