---
id: TASK-8
title: VS Code 扩展：WebviewPanel 看板，可编辑卡片
status: To Do
assignee: []
created_date: '2026-09-24 09:29'
updated_date: '2026-09-24 13:49'
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
- [x] #3 OpenClaw Control UI 面板在 host 接口抽象后照常可用
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TASK-7 结论落实：4 处 style=${...}（project-view.ts:584,637,1270,1326）改用自写 CSSOM 指令（不要用 styleMap，首次渲染仍走 setAttribute 被 CSP 拦）；CSP 用 default-src 'none'; img-src ${cspSource} data:; font-src ${cspSource}; style-src ${cspSource}; script-src 'nonce-${nonce}'；host 接口 confirm(): Promise<boolean>，VS Code 端用 showWarningMessage(msg,{modal:true},'确定')，否则 3 处 confirm 会静默变成取消；语言跟随 vscode.env.language，viewType 定了不要改（localStorage origin 与它绑定）。

TASK-1 遗留：前端改为从 @taskfold/core 引用 contract 后，删除 src/contract/index.ts 转发文件。

2026-09-24 用户要求完成后能在自己的 VS Code 里用上：追加范围——扩展打包成自包含 .vsix（core 打进 bundle，不依赖仓库路径），在隔离 user-data-dir/extensions-dir 里 --install-extension 后能打开看板；README/AGENTS.md 写安装命令。不代用户装进真实 VS Code，只交付 .vsix 与命令。

8a 完成（2026-09-24）：host 接口抽出（browser/host.ts），OpenClaw 实现 openclaw-host.ts；3 处 confirm 走 host；4 处 style 绑定改 CSSOM 指令（browser/lib/style-properties.ts），grep style=${ 为 0；语言由 host.locale 注入；执行界面按 capabilities.execution 隐藏；前端直引 @taskfold/core contract，已删 src/contract/index.ts。AC#3：build:control-ui + controlUi.reload 后 e2e 11 过/0 败，Playwright 确认框、style、执行区块三项正常。接口契约与 CAS 缺口见 backlog doc-2。
<!-- SECTION:NOTES:END -->
