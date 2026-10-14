---
id: CARD-69
title: CLI：资料库命令组（list/register/update/hide/delete）
status: todo
assignee: []
created_date: '2026-10-14 10:46'
updated_date: '2026-10-14 10:46'
labels:
  - CLI
milestone: 1d106956-b3ac-453e-bedb-0e495a8af4c7
dependencies: []
priority: normal
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Taskfold

<!-- SECTION:TASKFOLD:BEGIN -->
{
  "uuid": "f370e11d-58c5-42a2-a26c-c2932b1a7ba5",
  "position": 4000,
  "createdAt": 1791974777154,
  "notes": "来源：需求/24 批次执行中的实测缺口（2026-10-14）：登记 24 号文档进资料库用的是一次性 `openclaw gateway call taskfold.projects.documents.create`；node CLI 无资料库命令。\n\n## 范围（对齐网关 taskfold.projects.documents.*）\n- `taskfold docs list <board> [--hidden] [--json]`\n- `taskfold docs register <board> --key <k> --section <project|codebase|environment|knowledge> --title <t> --type <path|markdown|json|link|secret_ref> --target <path> [--summary <s>] [--json]`（只登记路径，不写文件）\n- `taskfold docs update <id> …`、`docs hide | restore <id>`、`docs delete <id>`\n- 校验与 store 一致：key 冲突拒绝、file./ai. 前缀保留、section/type 枚举\n\n## 验收\n- test/cli-contract.test.ts：register 后 `projects.get` 可见文档；key 冲突与保留前缀报错码\n- 纯 CLI 层：不改 store / 网关\n\n设计参考：packages/core/src/store-projects.ts 的 createProjectDocument / updateProjectDocument / hideProjectDocument / deleteProjectDocument。",
  "metadata": {
    "automation": {
      "boardId": "flowboard"
    }
  }
}
<!-- SECTION:TASKFOLD:END -->
