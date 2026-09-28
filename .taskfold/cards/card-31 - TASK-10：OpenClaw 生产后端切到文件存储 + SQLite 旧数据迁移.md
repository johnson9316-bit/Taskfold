---
id: CARD-31
title: OpenClaw 生产后端切到文件存储 + SQLite 旧数据迁移
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
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Taskfold

<!-- SECTION:TASKFOLD:BEGIN -->
{
  "uuid": "78b7e513-506e-4acd-aa50-4d327405b0ca",
  "position": 10000,
  "createdAt": 1790588980148,
  "notes": "已完成：OpenClaw 生产后端切到文件存储 + SQLite 旧数据迁移。\n\n实施范围：\n即 16 的「第 3 期切生产路径」：OpenClaw 适配层的生产存储从 SQLite（~/.openclaw/plugins/taskfold/taskfold.sqlite）切到 core 的文件后端；写一次性迁移，把各项目数据导出到对应仓库主 checkout 的 .taskfold/（卡片 md + .runtime/ 运行态），项目注册表写 projects.json。不补这一项，CLI/VS Code 写文件而 OpenClaw 读 SQLite，会出现两份真相。切换后 SQLite 后端下线：persistence-types.ts 的 CAS 改回无条件必选、去掉 store-change-tracker.ts:85 的类型断言（TASK-6 备注①）。涉及 doctor-contract-api.ts / openclaw.plugin.json / dist/index.js。\n\n验收记录：\n- [x] #1 迁移支持 dry-run，输出各实体计数并与 SQLite 一致（AGENTS.md 记录：cards 102、boards 4、milestones 12、project_documents 58，以迁移当时实测为准）\n- [x] #2 迁移前自动备份 taskfold.sqlite；不读不写 flowboard/gsdboard/workboard 三份历史库\n- [x] #3 切换后本机 Gateway 加载正常，Control UI 看到的项目/卡片/里程碑与迁移前一致\n- [x] #4 SQLite 下线后 compareAndSwap 对卡片 store 无条件必选，typecheck 通过\n\n完成摘要：\n文件后端已接管生产路径；SQLite 仅保留迁移命令的只读访问，测试中的旧写入实现仅作迁移夹具。迁移前自动备份及五项目数据核对已完成；本仓库 21 张卡和 4 份资料的路径改为项目根相对路径，procloud 未改。CAS 对卡片为必选真实比较交换，其他实体明确返回 unsupported。Gateway 从新包路径加载，43 个工具。\n\n原任务：TASK-10\n来源：backlog/tasks/task-10 - OpenClaw-生产后端切到文件存储-SQLite-旧数据迁移.md",
  "completedAt": 1790588980148,
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
