---
id: TASK-16
title: 看板「分列方式/排序方式」下拉框重渲染后显示第一项
status: Done
assignee: []
updated_date: '2026-09-28 16:45'
created_date: '2026-09-24 14:34'
labels:
  - ui
dependencies: []
priority: low
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-8b 发现的既有问题（OpenClaw 与 VS Code 共用代码）：看板重新渲染后，分列方式、排序方式两个 <select> 显示第一项，与实际分组不一致——select 的 value 在 option 渲染前就设置了（browser/pages/projects/project-view.ts）。
<!-- SECTION:DESCRIPTION:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
修正两个下拉框 option 的 selected 状态；共享前端实际浏览器验证 status/updatedAt/desc 重渲染后显示正确。
<!-- SECTION:FINAL_SUMMARY:END -->
