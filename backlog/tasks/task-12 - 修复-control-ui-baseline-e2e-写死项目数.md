---
id: TASK-12
title: 修复 control-ui-baseline e2e 写死项目数
status: To Do
assignee: []
created_date: '2026-09-24 10:36'
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
- [ ] #1 npm test 在本机无既有失败
- [ ] #2 断言不再依赖本机真实项目数量
<!-- AC:END -->
