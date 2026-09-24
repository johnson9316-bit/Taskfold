---
id: TASK-3
title: core：运行态移出卡片 md + contentHash 外部修改检测
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
priority: high
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
按 18 §3.7：先按实际写入频率核实字段清单（初步 claim/execution/sessionKey/runId/taskId，另查 delivery/events），移到 gitignore 的 .taskfold/.runtime/cards/<id>.json；revision（整数，16 R3）与 contentHash 同放运行态；卡锁内重算 hash，不一致先 revision+1 再 CAS；运行态丢失按当前 md 初始化。核实 16 §6.2 的 Backlog.md 格式兼容契约测试是否要调整。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 手工改卡片 md 后，持旧 revision 的写入被判冲突（测试先红后绿）
- [ ] #2 claim/心跳写入不改动任何 Git 跟踪文件（git status 干净）
- [ ] #3 删除 .runtime/ 后卡片内容完整、revision 重新初始化
<!-- AC:END -->
