---
id: TASK-7
title: VS Code：Webview 前置验证（CSP 内联 style、window.confirm）
status: Done
assignee: []
created_date: '2026-09-24 09:29'
updated_date: '2026-09-24 09:42'
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
- [x] #1 三项各有实测结论和截图/日志
- [x] #2 给出 CSP 的最终写法（styleMap 或 unsafe-inline）
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
真 VS Code 1.138.0 无头实测（--ozone-platform=headless + 独立 user-data-dir）。① style=${...} 共 4 处（project-view.ts:584,637,1270,1326），严格 style-src 下 style-src-attr 违规 11 次、样式不生效；styleMap 同样被拦（lit-html 3.3.3 首次渲染走 setAttribute）；自写 CSSOM 指令（update 里 el.style.setProperty）0 违规。推荐 CSP：default-src 'none'; img-src ${cspSource} data:; font-src ${cspSource}; style-src ${cspSource}; script-src 'nonce-${nonce}'。② window.confirm/alert 在 Webview 内 0ms 返回 false、不弹框（pre/index.html:1024-1032 sandbox 无 allow-modals）。③ localStorage 可读写且跨面板、跨重启持久，按 viewType+扩展 id 绑定 origin；未注册 serializer 时 getState 恒为 null。
<!-- SECTION:FINAL_SUMMARY:END -->
