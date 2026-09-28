---
id: TASK-11
title: OpenClaw 插件迁到 packages/openclaw
status: Done
assignee: []
created_date: '2026-09-24 10:36'
updated_date: '2026-09-28 16:45'
labels:
  - openclaw
  - refactor
milestone: m-0
dependencies:
  - TASK-6
references:
  - 需求/18-多宿主架构.md
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-1 为免改全局配置把插件留在仓库根；本任务把 openclaw.plugin.json、适配层 src/backend、Control UI 构建与 dist 迁到 packages/openclaw，根目录只做 workspaces 根。需同步修改 ~/.openclaw/openclaw.json 的 plugins.load.paths —— 这是全局配置，动手前须征得用户确认，并记录回滚方法。AGENTS.md 里的本机路径说明随之更新。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Gateway 从新路径加载 taskfold：inspect --runtime 为 loaded，工具数不变
- [x] #2 npm test / typecheck / build / check:public-names 通过
- [x] #3 AGENTS.md 的加载路径与验证方法已更新
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-24 定案：browser/ 前端源码迁成共享 workspace packages/ui；packages/openclaw 与 packages/vscode 各自从 packages/ui 构建产物，vscode 不反向依赖 openclaw 包。未采用：browser/ 并入 packages/openclaw（vscode 会依赖 openclaw 内部目录）、browser/ 暂留根目录（根目录只做 workspaces 根不达成）。用户已授权修改 ~/.openclaw/openclaw.json 的 plugins.load.paths（改前先备份）与重启 Gateway。

2026-09-24 进展：迁包在独立分支 task-11-packages-openclaw（171e8f6，基于 16257b1；worktree 在会话 scratchpad/wt-task11，目录没了分支仍在，git worktree prune 即可）完成：插件→packages/openclaw，browser/→packages/ui（@taskfold/ui），protocol.ts 归入 ui，根目录为 private workspaces 根；dist 纯 rename（R100），仍是 SQLite 构建。worktree 内单测 413 过/15 跳过，typecheck、check:public-names、build 通过；插件入口冒烟加载正常。**未合并**：合并必须在 TASK-10 迁移完成之后，且合并后立即改 plugins.load.paths → /home/john/src/personal/Taskfold/packages/openclaw（先备份 openclaw.json），步骤与回滚写在该分支 AGENTS.md「切换加载路径与回滚」。遗留：@noble/ed25519 源码已无引用、仍留在依赖里；.gitattributes 过时的 ui/dist 条目；README「From GitHub」安装方式失效（交 TASK-9 删除）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
迁包及加载路径切换已完成；Gateway runtime inspect 显示 packages/openclaw/dist/index.js，43 个工具。AGENTS.md 已更新本机步骤。
<!-- SECTION:FINAL_SUMMARY:END -->
