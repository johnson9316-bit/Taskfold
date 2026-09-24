---
id: TASK-2
title: core：两层跨进程文件锁 + 必选 CAS，改掉 7 处单进程假设
status: To Do
assignee: []
created_date: '2026-09-24 09:29'
labels:
  - core
  - concurrency
milestone: m-0
dependencies:
  - TASK-1
references:
  - 需求/18-多宿主架构.md
priority: high
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
按 18 §3.3、§3.4：proper-lockfile 全局锁（ID 分配/新建/revision 预留/跨卡）+ 每卡锁；compareAndSwap 改必选；锁超时映射为 CAS 返回 false（16 R2），约 2 秒；stale/update 参数写死在 core；处理 onCompromised；锁文件在主 checkout 的 .taskfold/.locks/ 并 gitignore；跨卡操作按 ID 排序加锁。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 双进程并发写同一张卡、并发新建卡片的测试，先在旧实现上证明会红，再在新实现上变绿
- [ ] #2 3.3 表中 7 处逐项有对应改动或说明
- [ ] #3 全部现有单测仍绿
<!-- AC:END -->
