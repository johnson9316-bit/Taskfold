---
id: TASK-6
title: OpenClaw 插件改调 core
status: Done
assignee: []
created_date: '2026-09-24 09:29'
updated_date: '2026-09-24 12:33'
labels:
  - openclaw
milestone: m-0
dependencies:
  - TASK-3
  - TASK-4
references:
  - 需求/18-多宿主架构.md
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
按 18 §7-3：工具、网关方法、执行调度全部改为依赖 core 包，执行状态走 core 的锁；projects.json 与 subscriptions 留在 OpenClaw 目录（18 §3.8）。现有功能不回退。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 现有单测全绿
- [x] #2 本机 Gateway 实际加载后 Control UI 面板可用（按 AGENTS.md 的验证方法）
- [x] #3 OpenClaw 与 CLI 同时写同一张卡，结果一致、无静默覆盖
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TASK-2 遗留：① persistence-types.ts 的 CAS 目前用条件类型「仅卡片 store 必选」，是为了让 sqlite-store.ts / doctor-contract-api.ts 继续编译；SQLite 后端下线时改回对所有卡片 store 无条件必选，并去掉 store-change-tracker.ts:85 的类型断言。② src/backend/src/store.ts 的 TaskfoldStore.open() 把宿主 KV store 强转为卡片 store，宿主 store 无 CAS，运行时会出错；当前零调用，改调 core 时删除或修正。

18 §9 待验证：store-enrichment.ts:272-300 的「worker 停止判定 blocked」是否属于执行逻辑——改调 core 时一并判定它该留在 core 还是移到适配层。

2026-09-24 验收口径：生产后端切文件存储在 TASK-10，本任务 AC#3「OpenClaw 与 CLI 同时写同一张卡」先用集成测试验（适配层进程内起文件后端 + CLI 子进程并发写），TASK-10 切换后再用真实 Gateway 复验。

TASK-4 遗留（已知问题，非阻塞）：文件后端每次写入同步拿全局锁，锁争用时最多阻塞事件循环约 2 秒（Gateway 进程里影响最大）；另：只读模式（format_version 更高）下人手改文件不会在本进程广播。改调 core 时评估是否需要改成异步锁，结论写进备注。

2026-09-24 处理结论：① CAS 条件类型与 store-change-tracker 类型断言未动，留 TASK-10；② TaskfoldStore.open() 已删（零调用，宿主 KV 无 CAS）；③ store-enrichment 的 worker 停止判定 blocked 留在 core（只做状态迁移，是否判 blocked 由调用方决定，同 block/stop 一类，符合 18 §3.2），18 §9 已勾；④ 同步全局锁阻塞事件循环延后到 TASK-10。reclaim/refreshDiagnostics/promoteReady 冲突直接抛 TaskfoldRevisionConflictError（多写操作不自动重试）；reconciler 已 catch 并计入 skipped。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
core 写卡一律以读到的 revision 做 CAS（store-core.ts:917），7 处裸 register 改走 persistCard；单卡读改写方法冲突重读重试，claim 重试能认出自己上一轮的 claim；多写操作冲突直接抛出，dispatch 逐卡跳过（新增 store-dispatch.ts）。store.ts 业务方法移入 core，适配层只留工厂，删除 open()。AC#3（test/openclaw-cli-concurrency：适配层进程内文件后端 + CLI 子进程，闸门制造读后写前并发）旧代码 8/8 红（7 例 CLI 追加正文被旧快照冲掉），实现后 8/8 绿，回退 CAS 复红。npm test 含 e2e 365 通过/4 跳过，SQLite 相关 63 过；重启 Gateway 后 loaded、43 工具/86 网关方法不变。重启前备份 ~/.openclaw/plugins/taskfold/backup/taskfold-20260924-202601.sqlite。
<!-- SECTION:FINAL_SUMMARY:END -->
