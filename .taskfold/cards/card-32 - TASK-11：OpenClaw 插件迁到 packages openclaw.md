---
id: CARD-32
title: OpenClaw 插件迁到 packages/openclaw
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
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Taskfold

<!-- SECTION:TASKFOLD:BEGIN -->
{
  "uuid": "50316b16-b433-43e6-9d71-c9161b2e746e",
  "position": 11000,
  "createdAt": 1790588981612,
  "notes": "已完成：OpenClaw 插件迁到 packages/openclaw。\n\n实施范围：\nTASK-1 为免改全局配置把插件留在仓库根；本任务把 openclaw.plugin.json、适配层 src/backend、Control UI 构建与 dist 迁到 packages/openclaw，根目录只做 workspaces 根。需同步修改 ~/.openclaw/openclaw.json 的 plugins.load.paths —— 这是全局配置，动手前须征得用户确认，并记录回滚方法。AGENTS.md 里的本机路径说明随之更新。\n\n验收记录：\n- [x] #1 Gateway 从新路径加载 taskfold：inspect --runtime 为 loaded，工具数不变\n- [x] #2 npm test / typecheck / build / check:public-names 通过\n- [x] #3 AGENTS.md 的加载路径与验证方法已更新\n\n完成摘要：\n迁包及加载路径切换已完成；Gateway runtime inspect 显示 packages/openclaw/dist/index.js，43 个工具。AGENTS.md 已更新本机步骤。\n\n原任务：TASK-11\n来源：backlog/tasks/task-11 - OpenClaw-插件迁到-packages-openclaw.md",
  "completedAt": 1790588981612,
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
