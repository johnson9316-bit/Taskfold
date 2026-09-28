---
id: CARD-23
title: core：两层跨进程文件锁 + 必选 CAS，改掉 7 处单进程假设
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
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Taskfold

<!-- SECTION:TASKFOLD:BEGIN -->
{
  "uuid": "50ec803f-44ab-4a15-bebd-66d0d4a6bda3",
  "position": 2000,
  "createdAt": 1790588967936,
  "notes": "已完成：core：两层跨进程文件锁 + 必选 CAS，改掉 7 处单进程假设。\n\n实施范围：\n按 18 §3.3、§3.4：proper-lockfile 全局锁（ID 分配/新建/revision 预留/跨卡）+ 每卡锁；compareAndSwap 改必选；锁超时映射为 CAS 返回 false（16 R2），约 2 秒；stale/update 参数写死在 core；处理 onCompromised；锁文件在主 checkout 的 .taskfold/.locks/ 并 gitignore；跨卡操作按 ID 排序加锁。\n\n验收记录：\n- [x] #1 双进程并发写同一张卡、并发新建卡片的测试，先在旧实现上证明会红，再在新实现上变绿\n- [x] #2 3.3 表中 7 处逐项有对应改动或说明\n- [x] #3 全部现有单测仍绿\n\n完成摘要：\nproper-lockfile 两层锁（file-store-locks.ts）：卡锁内 CAS（拿锁→重读→比 revision→tmp→assertHeld→rename），全局锁内分配卡片/里程碑 ID 与 reserveFileChangeRevisions；等锁 2s 超时与 compromised 均返回 false；stale 10s / update 5s。CAS 对卡片 store 必选（条件类型，SQLite 下线时放开，见 TASK-6）。多进程测试 (a)-(d) 在旧实现上稳定红（CAS 每轮 8/8 成功；40 卡仅 14-17 个不重复 ID；40 里程碑仅 11-13 个），新实现绿。npm test 290 通过。\n\n原任务：TASK-2\n来源：backlog/tasks/task-2 - core：两层跨进程文件锁-必选-CAS，改掉-7-处单进程假设.md",
  "completedAt": 1790588967936,
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
