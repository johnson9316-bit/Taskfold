---
id: CARD-36
title: VS Code 扩展支持资料库（documents）
status: done
assignee: []
created_date: '2026-09-28 09:49'
updated_date: '2026-09-28 09:56'
labels:
  - 历史任务
  - 多宿主
milestone: dc058a67-122f-4981-908e-188e515837a8
dependencies: []
priority: low
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Taskfold

<!-- SECTION:TASKFOLD:BEGIN -->
{
  "uuid": "12956c13-c473-4312-8ee6-e5345f3bf6fd",
  "position": 15000,
  "createdAt": 1790588987660,
  "notes": "已完成：VS Code 扩展支持资料库（documents）。\n\n实施范围：\nTASK-8 裁决：VS Code 首版用 documents:false 隐藏资料库，避免把 src/backend/src/project-document-reader.ts（依赖 openclaw SDK）的读写与 sha256 revision 逻辑复制进 packages/vscode。要支持的话，先把与 SDK 无关的部分抽进 core，再让两个宿主共用。\n\n完成摘要：\n文档预览、路径读写和 revision 校验抽至 core；OpenClaw 保持原工作区授权，VS Code 限制在项目根。9 个资料库方法已接入，隔离 VS Code 验证预览、保存与外部修改后的冲突；VSIX 已安装到真实 VS Code。\n\n原任务：TASK-15\n来源：backlog/tasks/task-15 - VS-Code-扩展支持资料库（documents）.md",
  "completedAt": 1790588987660,
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
