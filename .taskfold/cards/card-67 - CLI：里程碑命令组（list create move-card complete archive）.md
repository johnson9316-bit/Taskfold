---
id: CARD-67
title: CLI：里程碑命令组（list/create/move-card/complete/archive）
status: todo
assignee: []
created_date: '2026-10-14 10:46'
updated_date: '2026-10-14 10:46'
labels:
  - CLI
milestone: 1d106956-b3ac-453e-bedb-0e495a8af4c7
dependencies: []
priority: normal
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Taskfold

<!-- SECTION:TASKFOLD:BEGIN -->
{
  "uuid": "1442b502-3cb9-4b5a-878c-c35266423f39",
  "position": 2000,
  "createdAt": 1791974777009,
  "notes": "来源：需求/24 批次执行中的实测缺口（2026-10-14）：建里程碑与挂卡只能借 `openclaw taskfold project milestone …`，node CLI（AI 写卡通道）没有里程碑命令；AI 在 VS Code 宿主（无网关、无 openclaw CLI）无法完成这两步。\n\n## 现状\nnode CLI 命令面：init / list / show / create / update / delete / attach / boards / statuses / migrate / instructions / guidelines —— 无里程碑；create / update 也无 --milestone。\n\n## 范围（对齐 store / 网关已有能力）\n- `taskfold milestone list [--board <id>] [--json]`\n- `taskfold milestone create <board> <title> [--json]`\n- `taskfold milestone move-card <card> --milestone <id|unassigned> [--json]`（对齐插件 CLI 同名命令）\n- `taskfold milestone complete | archive | restore <id> [--json]`（网关有 milestones.complete/archive/restore；插件 CLI 也缺，node CLI 一并补）\n- `taskfold create / update` 增加可选 `--milestone <id>`\n\n## 验收\n- test/cli-contract.test.ts 补用例：list / create / move-card / complete 的 --json 输出与退出码、错误码\n- `taskfold instructions` 用法文本同步\n- 纯 CLI 层：不改 store / 网关；与插件 CLI 行为一致\n\n设计参考：packages/openclaw/src/backend/src/cli.ts（project milestone 实现）、packages/openclaw/src/backend/src/gateway-project-methods.ts（milestones.* 方法）。",
  "metadata": {
    "automation": {
      "boardId": "flowboard"
    }
  }
}
<!-- SECTION:TASKFOLD:END -->
