---
id: CARD-61
title: core：放开需求嵌套（8 层 + 防环 + 测试反转 + CLI 参数）
status: todo
assignee: []
created_date: '2026-10-14 10:38'
updated_date: '2026-10-14 10:46'
labels:
  - 子需求
milestone: 1e0b1780-39bc-4df1-b921-aba2c71b28c9
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
  "uuid": "a63baff0-fb81-49de-afaf-faad944068b3",
  "position": 1000,
  "createdAt": 1791974339571,
  "notes": "来源：需求/24-子需求与子看板.md §四 P1（评审 2026-10-14 通过，R2 = 8 层硬限）。\n\n## 范围\n\n1. `packages/core/src/store-core.ts` `setCardRequirementDirect`：移除两道闸——\"requirement cards cannot be assigned to another requirement\"（约 1661 行）与 \"nested requirements are not supported\"（约 1716 行）。\n2. 替换为：\n   - 防环校验：沿 `contained_by` 链从目标需求上行，链中不得出现被挂卡（参照同文件前置依赖防环的 \"dependency link would create a cycle.\" 写法，约 1797 行）。\n   - 深度校验：从最顶层需求到新挂卡最多 8 层，第 9 层拒绝，报错指明深度限制。\n3. 保留不变：不能挂自己、目标必须是需求卡、必须同项目、归档项目/卡拒绝、claim 守卫、`contains`/`contained_by` 成对维护、换父自动从旧父 detach、需求卡不可执行。\n4. CLI（`packages/cli`）：create/update 补 requirement 挂载参数（当前无此参数，AI 写库缺通道）。\n\n## 测试（`test/project-store.test.ts`）\n\n- 现有 \"requirement cards cannot be assigned\" 断言反转（nested 现应成功）。\n- 新增：8 层边界（第 8 层通过、第 9 层拒绝）、防环（A→B 后 B→A 拒绝）、深链换父自动 detach。\n- 全量测试绿。\n\n验收：见 需求/24 第五节第 1、2 条。",
  "sourceReferences": [
    {
      "id": "3d7e89b9-7217-42d6-b53c-06eab49941b5",
      "label": "设计文档：需求/24-子需求与子看板",
      "target": "./.taskfold/documents/需求/24-子需求与子看板.md",
      "position": 1000,
      "createdAt": 1791974793589,
      "updatedAt": 1791974793589
    }
  ],
  "metadata": {
    "automation": {
      "boardId": "flowboard"
    }
  }
}
<!-- SECTION:TASKFOLD:END -->
