---
id: TASK-5
title: CLI：卡片读写与状态流转 + --json 契约 + AI 指引
status: Done
assignee: []
created_date: '2026-09-24 09:29'
updated_date: '2026-09-24 11:54'
labels:
  - cli
milestone: m-0
dependencies:
  - TASK-3
  - TASK-4
references:
  - 需求/18-多宿主架构.md
priority: high
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
按 18 §4：commander 实现卡片增删改查与状态流转（不含执行）；--json 输出 {schemaVersion, kind, ...}；稳定错误码 CONFLICT/LOCKED/NOT_FOUND + 非零退出码 + stderr 结构化 JSON；非 TTY 自动纯文本；--help 带读写对象与示例；字段级增量参数，整体替换正文要求 --expect-revision；taskfold instructions 命令 + AGENTS.md/CLAUDE.md 带版本号标记块（写明不要直接编辑 .taskfold 下的 md）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 --json 输出与错误码有契约测试
- [x] #2 锁冲突/revision 冲突分别返回 LOCKED/CONFLICT 与非零退出码
- [x] #3 在 Claude Code 里只凭注入的标记块和 taskfold instructions，能完成建卡、改状态、改正文
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
18 §9 待验证：WSL 的 drvfs（/mnt/c）与 \\wsl$ 路径下 proper-lockfile 会误判锁为 compromised，在 CLI 文档/skill 与 README 中写明不支持这类路径。

TASK-4 遗留：core 工厂的 pluginDir 仍是必填参数。CLI 不能依赖 ~/.openclaw——本任务要让非 OpenClaw 宿主无需 pluginDir（改为可选或由宿主注入 .taskfold 内的路径），VS Code（TASK-8）同样受益。

遗留（未做，不阻塞）：① 卡片文件名用可读编号 card-N（16 C2），但 CLI 只接受 UUID（或前缀），show card-1 返回 NOT_FOUND，list 也只显示 UUID 前缀，宜支持按 card-N 查找并在输出里显示。② 全局锁被占超过 2 秒时，写后记 changes.log 会失败，一次性 CLI 进程退出后这笔变更通知就丢了（卡片本身已写入），其他宿主只能靠定期全量重读发现。③ create 在全局锁争用时 LOCKED 约需 4 秒（board 骨架写入多等一次锁）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
新增 packages/cli（commander + esbuild 自包含 bundle，产物 packages/cli/dist/taskfold.js，已 gitignore，npm run build:cli）：init/list/show/boards/create/update/delete/instructions/guidelines。--json 统一 {schemaVersion,kind,...}，10 个稳定错误码，stderr 恒为单行 JSON。core CAS 加可选 onReject 原因回调，store 层仍只返回 false，TaskfoldRevisionConflictError.reason 带出原因，CLI 据此区分 LOCKED(6)/CONFLICT(5)；去掉原因透传时 LOCKED 用例会红。pluginDir 改为可选，不传时 boards/订阅走进程内存、.taskfold 外零写入。正文即 notes（md 的 ## Description 区块 core 不暴露）。不做 --compact。AC#3 由零上下文代理只凭标记块 + instructions 完成建卡/改状态/换正文，结果逐字核对一致。npm test 357 通过/4 跳过；根/core/cli typecheck、check:public-names、build 均通过。
<!-- SECTION:FINAL_SUMMARY:END -->
