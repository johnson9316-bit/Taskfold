---
id: TASK-2
title: core：两层跨进程文件锁 + 必选 CAS，改掉 7 处单进程假设
status: Done
assignee: []
created_date: '2026-09-24 09:29'
updated_date: '2026-09-24 10:04'
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
- [x] #1 双进程并发写同一张卡、并发新建卡片的测试，先在旧实现上证明会红，再在新实现上变绿
- [x] #2 3.3 表中 7 处逐项有对应改动或说明
- [x] #3 全部现有单测仍绿
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
分工调整（2026-09-24）：18 §3.3 表第 1-5 行（同步原子性、ID 抢号、revision 预留、enqueueMutation、CAS 必选）归本任务；第 6 行（内存事件总线 → ChangeSource）移交 TASK-4，第 7 行（noteOwnWrite 自写标记）移交 TASK-3。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
proper-lockfile 两层锁（file-store-locks.ts）：卡锁内 CAS（拿锁→重读→比 revision→tmp→assertHeld→rename），全局锁内分配卡片/里程碑 ID 与 reserveFileChangeRevisions；等锁 2s 超时与 compromised 均返回 false；stale 10s / update 5s。CAS 对卡片 store 必选（条件类型，SQLite 下线时放开，见 TASK-6）。多进程测试 (a)-(d) 在旧实现上稳定红（CAS 每轮 8/8 成功；40 卡仅 14-17 个不重复 ID；40 里程碑仅 11-13 个），新实现绿。npm test 290 通过。
<!-- SECTION:FINAL_SUMMARY:END -->
