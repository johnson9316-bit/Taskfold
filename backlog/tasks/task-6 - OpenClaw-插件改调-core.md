---
id: TASK-6
title: OpenClaw 插件改调 core
status: To Do
assignee: []
created_date: '2026-09-24 09:29'
updated_date: '2026-09-24 10:36'
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
- [ ] #1 现有单测全绿
- [ ] #2 本机 Gateway 实际加载后 Control UI 面板可用（按 AGENTS.md 的验证方法）
- [ ] #3 OpenClaw 与 CLI 同时写同一张卡，结果一致、无静默覆盖
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TASK-2 遗留：① persistence-types.ts 的 CAS 目前用条件类型「仅卡片 store 必选」，是为了让 sqlite-store.ts / doctor-contract-api.ts 继续编译；SQLite 后端下线时改回对所有卡片 store 无条件必选，并去掉 store-change-tracker.ts:85 的类型断言。② src/backend/src/store.ts 的 TaskfoldStore.open() 把宿主 KV store 强转为卡片 store，宿主 store 无 CAS，运行时会出错；当前零调用，改调 core 时删除或修正。

18 §9 待验证：store-enrichment.ts:272-300 的「worker 停止判定 blocked」是否属于执行逻辑——改调 core 时一并判定它该留在 core 还是移到适配层。
<!-- SECTION:NOTES:END -->
