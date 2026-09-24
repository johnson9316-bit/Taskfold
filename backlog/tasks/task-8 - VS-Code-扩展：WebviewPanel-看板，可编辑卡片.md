---
id: TASK-8
title: VS Code 扩展：WebviewPanel 看板，可编辑卡片
status: To Do
assignee: []
created_date: '2026-09-24 09:29'
labels:
  - vscode
milestone: m-0
dependencies:
  - TASK-3
  - TASK-4
  - TASK-7
references:
  - 需求/18-多宿主架构.md
priority: high
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
按 18 §5：抽 browser/host.ts 为 host 接口（request/subscribe/connected/locale/confirm/能力开关）；VS Code 入口 + --vscode-* 主题映射 CSS；扩展进程内接 core，判别联合 postMessage；ChangeSource 用 FileSystemWatcher 提示 + 定期全量重读；隐藏执行相关界面；正文主要在看板编辑，另加按钮打开原 md；CAS 失败弹 Reload/Overwrite/View Diff，拖拽也走 CAS。架构参考 ysamlan/vscode-backlog-md（MIT）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 VS Code 中能拖卡改状态、编辑字段与正文
- [ ] #2 VS Code 编辑同时用 CLI 改同一张卡，弹出冲突三选一
- [ ] #3 OpenClaw Control UI 面板在 host 接口抽象后照常可用
<!-- AC:END -->
