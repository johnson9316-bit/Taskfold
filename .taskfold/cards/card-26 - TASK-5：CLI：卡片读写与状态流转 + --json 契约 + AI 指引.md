---
id: CARD-26
title: CLI：卡片读写与状态流转 + --json 契约 + AI 指引
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
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Taskfold

<!-- SECTION:TASKFOLD:BEGIN -->
{
  "uuid": "e9cd77bc-e29a-42c3-b836-58cd5088ef0e",
  "position": 5000,
  "createdAt": 1790588972447,
  "notes": "已完成：CLI：卡片读写与状态流转 + --json 契约 + AI 指引。\n\n实施范围：\n按 18 §4：commander 实现卡片增删改查与状态流转（不含执行）；--json 输出 {schemaVersion, kind, ...}；稳定错误码 CONFLICT/LOCKED/NOT_FOUND + 非零退出码 + stderr 结构化 JSON；非 TTY 自动纯文本；--help 带读写对象与示例；字段级增量参数，整体替换正文要求 --expect-revision；taskfold instructions 命令 + AGENTS.md/CLAUDE.md 带版本号标记块（写明不要直接编辑 .taskfold 下的 md）。\n\n验收记录：\n- [x] #1 --json 输出与错误码有契约测试\n- [x] #2 锁冲突/revision 冲突分别返回 LOCKED/CONFLICT 与非零退出码\n- [x] #3 在 Claude Code 里只凭注入的标记块和 taskfold instructions，能完成建卡、改状态、改正文\n\n完成摘要：\n新增 packages/cli（commander + esbuild 自包含 bundle，产物 packages/cli/dist/taskfold.js，已 gitignore，npm run build:cli）：init/list/show/boards/create/update/delete/instructions/guidelines。--json 统一 {schemaVersion,kind,...}，10 个稳定错误码，stderr 恒为单行 JSON。core CAS 加可选 onReject 原因回调，store 层仍只返回 false，TaskfoldRevisionConflictError.reason 带出原因，CLI 据此区分 LOCKED(6)/CONFLICT(5)；去掉原因透传时 LOCKED 用例会红。pluginDir 改为可选，不传时 boards/订阅走进程内存、.taskfold 外零写入。正文即 notes（md 的 ## Description 区块 core 不暴露）。不做 --compact。AC#3 由零上下文代理只凭标记块 + instructions 完成建卡/改状态/换正文，结果逐字核对一致。npm test 357 通过/4 跳过；根/core/cli typecheck、check:public-names、build 均通过。\n\n原任务：TASK-5\n来源：backlog/tasks/task-5 - CLI：卡片读写与状态流转-json-契约-AI-指引.md",
  "completedAt": 1790588972447,
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
