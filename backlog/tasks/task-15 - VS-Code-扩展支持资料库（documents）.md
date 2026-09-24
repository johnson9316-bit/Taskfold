---
id: TASK-15
title: VS Code 扩展支持资料库（documents）
status: To Do
assignee: []
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
