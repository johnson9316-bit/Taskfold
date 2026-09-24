---
id: TASK-12
title: 修复 control-ui-baseline e2e 写死项目数
status: Done
assignee: []
created_date: '2026-09-24 10:36'
updated_date: '2026-09-24 11:02'
labels:
  - test
milestone: m-0
dependencies: []
priority: low
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
test/e2e/control-ui-baseline.test.ts:206-214 断言写死 4 个项目，本机真实数据已是 5 个，3 个用例长期红（TASK-1 起每次复核都要人工排除）。改为从 Gateway 实时读取基线计数，或用隔离的测试数据，而不是依赖本机真实数据。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 npm test 在本机无既有失败
- [x] #2 断言不再依赖本机真实项目数量
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
control-ui-baseline e2e 两处写死项目数（4/3/4）改为 beforeAll 经 openclaw gateway call taskfold.projects.list（includeArchived true/false）实时取总数与未归档数比较；另修同文件陈旧断言：已知无关 404 从「必须出现」改为纯允许名单，删去 8cd934c 已移除的 /plugins/taskfold/ 旧 iframe 路由。注入名单外假 404 已证明会红。单跑该文件 11 通过 / 0 失败 / 1 跳过（第 3 期占位）。只读真实数据。
<!-- SECTION:FINAL_SUMMARY:END -->
