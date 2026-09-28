---
id: CARD-30
title: ClawHub 发布流程适配 monorepo
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
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Taskfold

<!-- SECTION:TASKFOLD:BEGIN -->
{
  "uuid": "692a17b4-5ef5-4ea7-ad4d-8a433675f06e",
  "position": 9000,
  "createdAt": 1790588978619,
  "notes": "已完成：ClawHub 发布流程适配 monorepo。\n\n实施范围：\n按 18 §9 待验证：核实 docs/CLAW_HUB_PUBLISHING.md 与 package.json files 白名单在 workspaces 结构下如何发布 openclaw 包，并更新文档。\n\n验收记录：\n- [x] #1 npm run pack:check 在 openclaw 包下产物内容正确\n- [x] #2 发布文档已更新\n\n完成摘要：\n在分支 task-11-packages-openclaw（eae6228，未合并，随 TASK-11 一起合）：README/LICENSE/THIRD-PARTY-NOTICES/UPSTREAM.md/docs/CLAW_HUB_PUBLISHING.md 只在仓库根保留一份，packages/openclaw/scripts/release-files.mjs 在打包前后显式拷贝/清理，副本 gitignore——不用 prepack 钩子，因为 clawhub CLI 内部以 --ignore-scripts 调 npm pack。pack:check（pack-check.mjs）校验产物，与迁包前 16257b1 基线 11 个文件逐一一致。README 删去已失效的 GitHub 安装方式；CLAW_HUB_PUBLISHING 补 monorepo 发布说明（命令里的路径要带 ./ 前缀，否则 npm 会把它当成 GitHub 简写；版本号只改 packages/openclaw/package.json）。\n2026-09-28 收尾：ClawHub 包清单与 monorepo 发布文档已完成；2026-09-28 重新执行 pack:check 通过。本轮不发布。\n\n原任务：TASK-9\n来源：backlog/tasks/task-9 - ClawHub-发布流程适配-monorepo.md",
  "completedAt": 1790588978619,
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
