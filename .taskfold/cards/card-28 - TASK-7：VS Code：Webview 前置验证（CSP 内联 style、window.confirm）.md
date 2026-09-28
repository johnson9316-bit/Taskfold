---
id: CARD-28
title: VS Code：Webview 前置验证（CSP 内联 style、window.confirm）
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
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Taskfold

<!-- SECTION:TASKFOLD:BEGIN -->
{
  "uuid": "dc82dccc-55b3-49c8-b04e-fd898e3fd197",
  "position": 7000,
  "createdAt": 1790588975580,
  "notes": "已完成：VS Code：Webview 前置验证（CSP 内联 style、window.confirm）。\n\n实施范围：\n按 18 §9 待验证：最小 VS Code 扩展加载现有 dist/control-ui 产物，实测 Lit style=${...} 绑定（project-view.ts:584,1270,1326）是否被 CSP 拦、window.confirm 是否失效、localStorage 行为。只出结论，产物放 scratchpad，不进仓库。与 core 任务无依赖，可并行。\n\n验收记录：\n- [x] #1 三项各有实测结论和截图/日志\n- [x] #2 给出 CSP 的最终写法（styleMap 或 unsafe-inline）\n\n完成摘要：\n真 VS Code 1.138.0 无头实测（--ozone-platform=headless + 独立 user-data-dir）。① style=${...} 共 4 处（project-view.ts:584,637,1270,1326），严格 style-src 下 style-src-attr 违规 11 次、样式不生效；styleMap 同样被拦（lit-html 3.3.3 首次渲染走 setAttribute）；自写 CSSOM 指令（update 里 el.style.setProperty）0 违规。推荐 CSP：default-src 'none'; img-src ${cspSource} data:; font-src ${cspSource}; style-src ${cspSource}; script-src 'nonce-${nonce}'。② window.confirm/alert 在 Webview 内 0ms 返回 false、不弹框（pre/index.html:1024-1032 sandbox 无 allow-modals）。③ localStorage 可读写且跨面板、跨重启持久，按 viewType+扩展 id 绑定 origin；未注册 serializer 时 getState 恒为 null。\n\n原任务：TASK-7\n来源：backlog/tasks/task-7 - VS-Code：Webview-前置验证（CSP-内联-style、window.confirm）.md",
  "completedAt": 1790588975580,
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
