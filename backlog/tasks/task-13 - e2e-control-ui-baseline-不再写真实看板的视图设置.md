---
id: TASK-13
title: e2e control-ui-baseline 不再写真实看板的视图设置
status: Done
assignee: []
updated_date: '2026-09-28 16:45'
created_date: '2026-09-24 12:33'
labels:
  - test
dependencies: []
priority: medium
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-6 发现：test/e2e/control-ui-baseline.test.ts 会改 flowboard 项目的分列、排序、方向并写入真实 SQLite，跑完值会还原，但 updated_at 被刷新；语言与「含已归档」只存在浏览器里。测试不应写真实数据：改用隔离数据，或者只读断言。TASK-10 切到文件后端后，写入目标会变成真实仓库的 .taskfold/，风险更大。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 e2e 跑完后真实项目数据（含 updated_at）零变化
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
e2e 改为只读断言，并对真实 .taskfold/ 文件内容与 mtime 做前后快照；隔离运行 11 项通过。
<!-- SECTION:FINAL_SUMMARY:END -->
