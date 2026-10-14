---
id: CARD-72
title: 看板/列表增强候选（待点名）：隐藏已完成、搜索、过滤、行内编辑
status: backlog
assignee: []
created_date: '2026-10-14 10:50'
updated_date: '2026-10-14 10:51'
labels:
  - 看板
milestone: b56a1f5f-2d72-4371-9373-9c837cc3d52f
dependencies: []
priority: normal
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Taskfold

<!-- SECTION:TASKFOLD:BEGIN -->
{
  "uuid": "487a0a59-9e39-43af-bb43-b8e8d65dfc1c",
  "position": 13000,
  "createdAt": 1791975018112,
  "notes": "来源：双视图交付（提交 3f59827）时列为「Phase 2 候选（待用户点名）」；看板视觉评估时另提到的「隐藏已完成」开关。本卡是收纳与优先级池，**待点名后逐项拆卡，不要求一次全做**。\n\n## 候选项\n1. **隐藏/折叠已完成卡**：看板与列表共用的开关（前端当前无任何 hideDone 实现，需加 UI 状态；会话级还是持久化待定）。\n2. **列表搜索框**：标题 / 编号（card-N）/ 标签。\n3. **过滤**：状态、类型（任务/需求）、标签。\n4. **分组分段**：按状态或里程碑把行分段（复用「分列方式」语义）。\n5. **行内编辑**：勾选完成已有；改状态 / 优先级是否行内待定。\n6. **标签列**：列表加标签展示列。\n\n## 参考\n- 需求/24 的 P4/P5 会引入「按需求聚焦」与多命名视图，第 3/4 项届时可与之整合，避免做两遍。\n\n2026-10-14 补充（看板盘点决定）：\n\n① 36 张 done 卡**未**批量归档——推荐用本卡候选 1（hide-done 开关）解决：非破坏、即时切换、保留完成列语义；批量归档动作大且改变观感，未被用户正面采纳过。\n\n② 里程碑删除/隐藏功能缺失：空里程碑「后续调整（一）」已归档（state=archived，可恢复），但 `listMilestones` 不过滤归档里程碑、看板 `renderBoard` 全量渲染所有状态的列——归档只是状态标记，达不到\"移除空列\"效果。如仍需真正隐藏/删除，作为本卡候选 7（里程碑列显示控制）。",
  "metadata": {
    "automation": {
      "boardId": "flowboard"
    }
  }
}
<!-- SECTION:TASKFOLD:END -->
