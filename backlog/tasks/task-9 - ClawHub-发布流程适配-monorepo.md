---
id: TASK-9
title: ClawHub 发布流程适配 monorepo
status: Done
assignee: []
created_date: '2026-09-24 09:29'
updated_date: '2026-09-28 16:45'
labels:
  - release
milestone: m-0
dependencies:
  - TASK-1
  - TASK-11
references:
  - 需求/18-多宿主架构.md
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
按 18 §9 待验证：核实 docs/CLAW_HUB_PUBLISHING.md 与 package.json files 白名单在 workspaces 结构下如何发布 openclaw 包，并更新文档。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 npm run pack:check 在 openclaw 包下产物内容正确
- [x] #2 发布文档已更新
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
依赖补上 TASK-11：插件迁到 packages/openclaw 之后才有「openclaw 包」可发布。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
在分支 task-11-packages-openclaw（eae6228，未合并，随 TASK-11 一起合）：README/LICENSE/THIRD-PARTY-NOTICES/UPSTREAM.md/docs/CLAW_HUB_PUBLISHING.md 只在仓库根保留一份，packages/openclaw/scripts/release-files.mjs 在打包前后显式拷贝/清理，副本 gitignore——不用 prepack 钩子，因为 clawhub CLI 内部以 --ignore-scripts 调 npm pack。pack:check（pack-check.mjs）校验产物，与迁包前 16257b1 基线 11 个文件逐一一致。README 删去已失效的 GitHub 安装方式；CLAW_HUB_PUBLISHING 补 monorepo 发布说明（命令里的路径要带 ./ 前缀，否则 npm 会把它当成 GitHub 简写；版本号只改 packages/openclaw/package.json）。
2026-09-28 收尾：ClawHub 包清单与 monorepo 发布文档已完成；2026-09-28 重新执行 pack:check 通过。本轮不发布。
<!-- SECTION:FINAL_SUMMARY:END -->
