---
id: CARD-58
title: 注册 kanbanfile 占位（npm 名与组织、GitHub 组织、ClawHub 占位包）
status: backlog
assignee: []
created_date: '2026-10-14 07:00'
updated_date: '2026-10-14 07:00'
labels:
  - 开源化
dependencies: []
priority: normal
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Taskfold

<!-- SECTION:TASKFOLD:BEGIN -->
{
  "uuid": "6646605d-3ae4-4e43-a343-ffaa5a14ae41",
  "position": 1000,
  "createdAt": 1791961225789,
  "notes": "## 目标\n\n在 npm、GitHub、ClawHub 上占位锁定已定产品名 `kanbanfile`，避免项目继续迭代期间被他人抢注。\n\n## 背景（需求/23-开源化改造 §三 D4/D6、§4.5）\n\n- 改名与换仓库整体推迟到推出前执行。\n- 这是推迟方案里唯一有「早做早锁名」收益的动作：成本 5 分钟；名字一旦被抢，D6 的定名调研（两轮筛选 + 域名/商标核查）要重做。\n- 不需要改动当前仓库任何代码或配置。\n\n## 动作（需你本人登录执行，凭据不经过 AI）\n\n1. npm 无 scope 名 `kanbanfile`：发 0.0.1 占位包（或至少确认可注册）\n2. npm 组织 `kanbanfile`\n3. GitHub 组织 `kanbanfile`\n4. ClawHub 占位包\n5. 域名 `.io` / `.dev`（可选，`.com` 也可）：注册前用 RDAP 复查——勿用 DNS 判断（本机 Clash fake-ip 会全部误报为已占用）\n\n商标核查已完成（无同名注册；`KANBAN` 与 `KANBAN TOOL` 均在 Supplemental 补充注册簿），无须再查。\n\n## 完成标准\n\nnpm 名、GitHub 组织、ClawHub 三个必做项已占位；npm 组织与域名按需。\n\n后续步骤：全量改名与迁移见 card-59。",
  "metadata": {
    "automation": {
      "boardId": "flowboard"
    }
  }
}
<!-- SECTION:TASKFOLD:END -->
