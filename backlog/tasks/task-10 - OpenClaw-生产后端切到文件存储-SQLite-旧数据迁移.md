---
id: TASK-10
title: OpenClaw 生产后端切到文件存储 + SQLite 旧数据迁移
status: Done
assignee: []
created_date: '2026-09-24 10:36'
updated_date: '2026-09-28 16:45'
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
- [x] #1 迁移支持 dry-run，输出各实体计数并与 SQLite 一致（AGENTS.md 记录：cards 102、boards 4、milestones 12、project_documents 58，以迁移当时实测为准）
- [x] #2 迁移前自动备份 taskfold.sqlite；不读不写 flowboard/gsdboard/workboard 三份历史库
- [x] #3 切换后本机 Gateway 加载正常，Control UI 看到的项目/卡片/里程碑与迁移前一致
- [x] #4 SQLite 下线后 compareAndSwap 对卡片 store 无条件必选，typecheck 通过
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-24 用户已授权真实迁移：先备份 taskfold.sqlite，把各项目数据写入各自仓库主 checkout 的 .taskfold/（其他仓库里只产生未跟踪文件，不在其他仓库 commit），按需重启 Gateway；回滚方法写进文档。追加验收：TASK-6 AC#3 用真实 Gateway + CLI 复验。

TASK-4 遗留：适配层聚合游标 src/backend/src/change-aggregator.ts 还没接进 index.ts（gateway.ts 已加可选参数 changes），切文件后端时接上并验证 Control UI 跨项目刷新。

TASK-6 移交：同步全局锁在锁争用时最多阻塞 Gateway 事件循环约 2 秒，TASK-6 评估后决定放到本任务（切到文件后端后才会真正碰到）：record 改用异步锁，poll 补记只试一次。

2026-09-24 第一阶段盘点结论与裁决：项目 5 个——procloud(lz/procloud，81 卡/3 里程碑/35 文档)、flowboard(=本仓库，21 卡/8 里程碑/4 文档)、vmcloud(lz/vmcloud，零数据)、default(无 workspace，20 份空文档)、fb-probe(已归档无 workspace，1 里程碑)。裁决：① 适配层组合 store 按 boardId 查 projects.json 路由；② 无 workspace 项目数据根放 ~/.openclaw/plugins/taskfold/projects/<boardId>/，不丢数据、default 项目建卡照常；③ createdAt 毫秒精度存进 md 的 TASKFOLD 区块，position 相同用确定性次级键复现迁移前 UI 顺序；④ 本仓库与 procloud/vmcloud 的 .taskfold/ 都不提交，留给用户决定；⑤ 零数据项目首次写入才建 .taskfold/；⑥ 迁移工具随插件发布为 openclaw taskfold migrate-sqlite --dry-run|--apply，启动时发现 sqlite 且无 projects.json 打 WARN，不自动迁移；⑦ 39 份文档/102 张卡含 /home/john 绝对路径，不改写，报告用户。分两次提交：先切换，再删 SQLite 运行时后端。

2026-09-24 第一段进展：切换代码（组合 store、无 workspace 项目落插件目录、createdAt 毫秒、确定性排序、异步锁、migrate-sqlite 子命令、启动 WARN）已提交，测试 378 通过/15 跳过（关 e2e）；真实数据 dry-run 5 个项目计数 identical、blockers none。**真实 --apply 被 Claude Code auto mode 分类器以 Modify Shared Resources 拦截（子代理与主代理各一次），未执行、未写任何文件**。为防 Gateway 意外重启加载空文件后端，dist/ 刻意保留 SQLite 构建（HEAD 版），迁移前不要跑 build:backend 后重启 Gateway。待用户执行：npm run build:backend → openclaw gateway stop → openclaw taskfold migrate-sqlite --apply → openclaw gateway start；之后再做 RPC 基线比对（scratchpad/baseline-before.json、compare.mjs）、临时项目上的 Gateway+CLI 并发复验、e2e，以及第二段（删 SQLite 运行时后端）。注意：迁移前若 Gateway 以新构建启动并被打开 UI，会生成 projects.json，迁移随即拒绝执行，需先挪走它。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
文件后端已接管生产路径；SQLite 仅保留迁移命令的只读访问，测试中的旧写入实现仅作迁移夹具。迁移前自动备份及五项目数据核对已完成；本仓库 21 张卡和 4 份资料的路径改为项目根相对路径，procloud 未改。CAS 对卡片为必选真实比较交换，其他实体明确返回 unsupported。Gateway 从新包路径加载，43 个工具。
<!-- SECTION:FINAL_SUMMARY:END -->
