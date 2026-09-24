---
id: TASK-7
title: VS Code：Webview 前置验证（CSP 内联 style、window.confirm）
status: To Do
assignee: []
created_date: '2026-09-24 09:29'
labels:
  - vscode
  - spike
milestone: m-0
dependencies: []
references:
  - 需求/18-多宿主架构.md
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
按 18 §9 待验证：最小 VS Code 扩展加载现有 dist/control-ui 产物，实测 Lit style=${...} 绑定（project-view.ts:584,1270,1326）是否被 CSP 拦、window.confirm 是否失效、localStorage 行为。只出结论，产物放 scratchpad，不进仓库。与 core 任务无依赖，可并行。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 三项各有实测结论和截图/日志
- [ ] #2 给出 CSP 的最终写法（styleMap 或 unsafe-inline）
<!-- AC:END -->
