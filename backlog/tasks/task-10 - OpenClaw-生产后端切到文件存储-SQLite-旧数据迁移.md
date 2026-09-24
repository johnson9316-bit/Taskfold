---
id: TASK-10
title: OpenClaw 生产后端切到文件存储 + SQLite 旧数据迁移
status: To Do
assignee: []
created_date: '2026-09-24 10:36'
updated_date: '2026-09-24 12:07'
labels:
  - openclaw
  - storage
  - migration
milestone: m-0
dependencies:
  - TASK-6
references:
  - 需求/18-多宿主架构.md
  - 需求/16-文件存储改造.md
priority: high
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
即 16 的「第 3 期切生产路径」：OpenClaw 适配层的生产存储从 SQLite（~/.openclaw/plugins/taskfold/taskfold.sqlite）切到 core 的文件后端；写一次性迁移，把各项目数据导出到对应仓库主 checkout 的 .taskfold/（卡片 md + .runtime/ 运行态），项目注册表写 projects.json。不补这一项，CLI/VS Code 写文件而 OpenClaw 读 SQLite，会出现两份真相。切换后 SQLite 后端下线：persistence-types.ts 的 CAS 改回无条件必选、去掉 store-change-tracker.ts:85 的类型断言（TASK-6 备注①）。涉及 doctor-contract-api.ts / openclaw.plugin.json / dist/index.js。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 迁移支持 dry-run，输出各实体计数并与 SQLite 一致（AGENTS.md 记录：cards 102、boards 4、milestones 12、project_documents 58，以迁移当时实测为准）
- [ ] #2 迁移前自动备份 taskfold.sqlite；不读不写 flowboard/gsdboard/workboard 三份历史库
- [ ] #3 切换后本机 Gateway 加载正常，Control UI 看到的项目/卡片/里程碑与迁移前一致
- [ ] #4 SQLite 下线后 compareAndSwap 对卡片 store 无条件必选，typecheck 通过
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-24 用户已授权真实迁移：先备份 taskfold.sqlite，把各项目数据写入各自仓库主 checkout 的 .taskfold/（其他仓库里只产生未跟踪文件，不在其他仓库 commit），按需重启 Gateway；回滚方法写进文档。追加验收：TASK-6 AC#3 用真实 Gateway + CLI 复验。

TASK-4 遗留：适配层聚合游标 src/backend/src/change-aggregator.ts 还没接进 index.ts（gateway.ts 已加可选参数 changes），切文件后端时接上并验证 Control UI 跨项目刷新。

TASK-6 移交：同步全局锁在锁争用时最多阻塞 Gateway 事件循环约 2 秒，TASK-6 评估后决定放到本任务（切到文件后端后才会真正碰到）：record 改用异步锁，poll 补记只试一次。
<!-- SECTION:NOTES:END -->
