---
id: TASK-15
title: VS Code 扩展支持资料库（documents）
status: Done
assignee: []
updated_date: '2026-09-28 16:45'
created_date: '2026-09-24 14:00'
labels:
  - vscode
dependencies: []
priority: low
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-8 裁决：VS Code 首版用 documents:false 隐藏资料库，避免把 src/backend/src/project-document-reader.ts（依赖 openclaw SDK）的读写与 sha256 revision 逻辑复制进 packages/vscode。要支持的话，先把与 SDK 无关的部分抽进 core，再让两个宿主共用。
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
文档预览、路径读写和 revision 校验抽至 core；OpenClaw 保持原工作区授权，VS Code 限制在项目根。9 个资料库方法已接入，隔离 VS Code 验证预览、保存与外部修改后的冲突；VSIX 已安装到真实 VS Code。
<!-- SECTION:FINAL_SUMMARY:END -->
