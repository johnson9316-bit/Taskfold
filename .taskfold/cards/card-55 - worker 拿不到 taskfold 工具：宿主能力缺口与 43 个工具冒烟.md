---
id: CARD-55
title: worker 拿不到 taskfold 工具：宿主能力缺口与 43 个工具冒烟
status: blocked
assignee: []
created_date: '2026-10-08 09:34'
updated_date: '2026-10-08 10:16'
labels:
  - 开发执行
  - 宿主缺口
milestone: 8576fb77-fff2-4b39-bff0-9306acdd8fce
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
  "uuid": "3a7c67c8-4b06-4981-a478-8ee9736ea78d",
  "position": 8000,
  "createdAt": 1791452066527,
  "notes": "来源：.taskfold/documents/需求/8.6-问题修复.md「已确认卡住」「待验证」。2026-07-29 在 OpenClaw 2026.7.1-2 上实测：派发的 worker 工具列表里没有 taskfold_*，插件 SDK 没有给 subagent 挂工具的入口，导致 43 个工具从未真正冒烟。注意：该结论基于 2026.7.1-2，本机现为 2026.9.4，需先复核缺口是否仍在。完成条件：确认宿主能力（或静态配置办法）后，对 43 个工具逐个冒烟。",
  "metadata": {
    "automation": {
      "boardId": "flowboard"
    }
  }
}
<!-- SECTION:TASKFOLD:END -->
