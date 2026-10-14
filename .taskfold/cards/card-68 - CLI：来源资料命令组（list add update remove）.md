---
id: CARD-68
title: CLI：来源资料命令组（list/add/update/remove）
status: todo
assignee: []
created_date: '2026-10-14 10:46'
updated_date: '2026-10-14 10:46'
labels:
  - CLI
milestone: 1d106956-b3ac-453e-bedb-0e495a8af4c7
dependencies: []
priority: normal
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Taskfold

<!-- SECTION:TASKFOLD:BEGIN -->
{
  "uuid": "8e6405b2-d6a3-4407-937a-12514512cb07",
  "position": 3000,
  "createdAt": 1791974777084,
  "notes": "来源：需求/24 批次执行中的实测缺口（2026-10-14）：给卡片挂「来源资料」（sourceReferences）只能走 `openclaw gateway call taskfold.cards.sources.create`；node CLI 无命令，VS Code 宿主无法挂来源。\n\n## 范围（对齐网关 taskfold.cards.sources.*）\n- `taskfold source list <card> [--json]`\n- `taskfold source add <card> --label <txt> --target <path|url> [--note <txt>] [--json]`\n- `taskfold source update <card> --source <id> [--label | --target | --note]`\n- `taskfold source remove <card> --source <id>`\n- target 支持项目相对路径（./ 前缀，经 projectPath 映射）与 URL；单行约束与 store 一致\n\n## 背景\n卡片详情 UI 已有「来源资料」区（可点开）；卡片与文档的关联（评审卡 → 设计文档）目前只能用网关挂。此命令组让 AI 在任何宿主都能建链。\n\n## 验收\n- test/cli-contract.test.ts：add 后 `show --json` 可见 sourceReferences；换行 target 被拒（错误码）\n- 与 store.addSourceReference 校验语义一致（label 规范、target/note 长度与单行约束）\n\n设计参考：packages/core/src/store-core.ts 的 addSourceReference / updateSourceReference / deleteSourceReference。",
  "metadata": {
    "automation": {
      "boardId": "flowboard"
    }
  }
}
<!-- SECTION:TASKFOLD:END -->
