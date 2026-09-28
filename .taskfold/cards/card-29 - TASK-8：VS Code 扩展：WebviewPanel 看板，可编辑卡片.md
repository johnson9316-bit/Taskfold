---
id: CARD-29
title: VS Code 扩展：WebviewPanel 看板，可编辑卡片
status: done
assignee: []
created_date: '2026-09-28 09:49'
updated_date: '2026-09-28 09:56'
labels:
  - 历史任务
  - 多宿主
milestone: dc058a67-122f-4981-908e-188e515837a8
dependencies: []
priority: high
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Taskfold

<!-- SECTION:TASKFOLD:BEGIN -->
{
  "uuid": "7efa438d-5853-4bfc-819a-d02fe0930296",
  "position": 8000,
  "createdAt": 1790588977110,
  "notes": "已完成：VS Code 扩展：WebviewPanel 看板，可编辑卡片。\n\n实施范围：\n按 18 §5：抽 browser/host.ts 为 host 接口（request/subscribe/connected/locale/confirm/能力开关）；VS Code 入口 + --vscode-* 主题映射 CSS；扩展进程内接 core，判别联合 postMessage；ChangeSource 用 FileSystemWatcher 提示 + 定期全量重读；隐藏执行相关界面；正文主要在看板编辑，另加按钮打开原 md；CAS 失败弹 Reload/Overwrite/View Diff，拖拽也走 CAS。架构参考 ysamlan/vscode-backlog-md（MIT）。\n\n验收记录：\n- [x] #1 VS Code 中能拖卡改状态、编辑字段与正文\n- [x] #2 VS Code 编辑同时用 CLI 改同一张卡，弹出冲突三选一\n- [x] #3 OpenClaw Control UI 面板在 host 接口抽象后照常可用\n\n完成摘要：\n8a：抽出 host 接口（browser/host.ts），OpenClaw 实现收拢长轮询、localStorage 语言与 confirm；4 处 style 绑定改 CSSOM 指令；前端直引 core contract，删除 src/contract/index.ts。8b：新增 packages/vscode（WebviewPanel 复用 Lit 前端，CSP 按 TASK-7 结论，FileSystemWatcher 合并 300ms + 每 30s 全量重读），能力开关 cardRevisionCheck/cardEditing/openCardFile 仅 VS Code 开，execution/projectManagement/documents 仅 OpenClaw 开。卡片详情新增草稿式编辑（标题/优先级/正文）；update/move/moveMilestone 均走 core CAS（move/moveMilestone 新增可选 expectedRevision，网关不传时行为不变有测试），冲突弹 Reload/Overwrite/View Diff。自包含 packages/vscode/taskfold-0.2.0.vsix（264KB，gitignore）在隔离的真实 VS Code 1.138 中验收：真实拖卡、编辑、四种冲突分支（含拖拽冲突）均经 CLI 核对。npm test 含 e2e 424 通过/4 跳过，四处 typecheck 与 check:public-names 通过。\n\n原任务：TASK-8\n来源：backlog/tasks/task-8 - VS-Code-扩展：WebviewPanel-看板，可编辑卡片.md",
  "completedAt": 1790588977110,
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
