---
id: CARD-71
title: 面板复核补测：VS Code 实机 + 窄屏/深色/缺样本场景
status: backlog
assignee: []
created_date: '2026-10-14 10:50'
updated_date: '2026-10-14 10:50'
labels:
  - UI
milestone: 1d106956-b3ac-453e-bedb-0e495a8af4c7
dependencies: []
priority: normal
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Taskfold

<!-- SECTION:TASKFOLD:BEGIN -->
{
  "uuid": "3a05dd81-eddd-42ca-ac32-78f74a08e967",
  "position": 5000,
  "createdAt": 1791975015286,
  "notes": "来源：需求/21-面板UIUX修复交接.md §二（还没验的，需要人手）+ §六（评审覆盖缺口仍然存在）。\n\n## 范围\n1. **VS Code 实机**（装 vsix）：UX-001 主题配对、UX-005 模态确认框、UX-009 焦点循环；另补新交付的**列表视图**在 VS Code webview 的实机验证（上一轮只测了 OpenClaw 侧，viewState 持久化链路测试覆盖但未手验）。\n2. **窄屏**：820 / 560 宽度（Chrome 需取消最大化才能真实触发媒体查询）。\n3. **系统级深色**下的 warn/info/success 配色（此前只测了宿主选 Dark + 系统浅色）。\n4. **缺样本场景**：需求卡、流程图关系边、归档卡/已完成里程碑、运行中执行、隐藏文档——部分场景已被后来的数据覆盖，核实时先跑一遍 card-57 的样本清单。\n\n## 说明\n- 这是验证动作、不是修复；发现问题开新卡或并入 card-57。\n- 21 §二/§五记录了已知坑（Chrome resize 不生效、凭据只能本人填、别泛搜 localStorage 等），照其方法做。",
  "metadata": {
    "automation": {
      "boardId": "flowboard"
    }
  }
}
<!-- SECTION:TASKFOLD:END -->
