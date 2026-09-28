---
id: CARD-34
title: e2e control-ui-baseline 不再写真实看板的视图设置
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
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Taskfold

<!-- SECTION:TASKFOLD:BEGIN -->
{
  "uuid": "741073db-92c4-40d6-b5ca-4d583846dc03",
  "position": 13000,
  "createdAt": 1790588984630,
  "notes": "已完成：e2e control-ui-baseline 不再写真实看板的视图设置。\n\n实施范围：\nTASK-6 发现：test/e2e/control-ui-baseline.test.ts 会改 flowboard 项目的分列、排序、方向并写入真实 SQLite，跑完值会还原，但 updated_at 被刷新；语言与「含已归档」只存在浏览器里。测试不应写真实数据：改用隔离数据，或者只读断言。TASK-10 切到文件后端后，写入目标会变成真实仓库的 .taskfold/，风险更大。\n\n验收记录：\n- [x] #1 e2e 跑完后真实项目数据（含 updated_at）零变化\n\n完成摘要：\ne2e 改为只读断言，并对真实 .taskfold/ 文件内容与 mtime 做前后快照；隔离运行 11 项通过。\n\n原任务：TASK-13\n来源：backlog/tasks/task-13 - e2e-control-ui-baseline-不再写真实看板的视图设置.md",
  "completedAt": 1790588984630,
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
