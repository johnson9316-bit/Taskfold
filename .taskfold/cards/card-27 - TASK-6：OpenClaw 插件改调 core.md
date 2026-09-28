---
id: CARD-27
title: OpenClaw 插件改调 core
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
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Taskfold

<!-- SECTION:TASKFOLD:BEGIN -->
{
  "uuid": "b769baa7-2f63-4a57-aca2-8cd1d5c4f70c",
  "position": 6000,
  "createdAt": 1790588974034,
  "notes": "已完成：OpenClaw 插件改调 core。\n\n实施范围：\n按 18 §7-3：工具、网关方法、执行调度全部改为依赖 core 包，执行状态走 core 的锁；projects.json 与 subscriptions 留在 OpenClaw 目录（18 §3.8）。现有功能不回退。\n\n验收记录：\n- [x] #1 现有单测全绿\n- [x] #2 本机 Gateway 实际加载后 Control UI 面板可用（按 AGENTS.md 的验证方法）\n- [x] #3 OpenClaw 与 CLI 同时写同一张卡，结果一致、无静默覆盖\n\n完成摘要：\ncore 写卡一律以读到的 revision 做 CAS（store-core.ts:917），7 处裸 register 改走 persistCard；单卡读改写方法冲突重读重试，claim 重试能认出自己上一轮的 claim；多写操作冲突直接抛出，dispatch 逐卡跳过（新增 store-dispatch.ts）。store.ts 业务方法移入 core，适配层只留工厂，删除 open()。AC#3（test/openclaw-cli-concurrency：适配层进程内文件后端 + CLI 子进程，闸门制造读后写前并发）旧代码 8/8 红（7 例 CLI 追加正文被旧快照冲掉），实现后 8/8 绿，回退 CAS 复红。npm test 含 e2e 365 通过/4 跳过，SQLite 相关 63 过；重启 Gateway 后 loaded、43 工具/86 网关方法不变。重启前备份 ~/.openclaw/plugins/taskfold/backup/taskfold-20260924-202601.sqlite。\n\n原任务：TASK-6\n来源：backlog/tasks/task-6 - OpenClaw-插件改调-core.md",
  "completedAt": 1790588974034,
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
