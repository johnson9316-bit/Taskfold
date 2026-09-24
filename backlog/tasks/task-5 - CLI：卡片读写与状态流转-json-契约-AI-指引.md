---
id: TASK-5
title: CLI：卡片读写与状态流转 + --json 契约 + AI 指引
status: To Do
assignee: []
created_date: '2026-09-24 09:29'
updated_date: '2026-09-24 10:36'
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
- [ ] #1 --json 输出与错误码有契约测试
- [ ] #2 锁冲突/revision 冲突分别返回 LOCKED/CONFLICT 与非零退出码
- [ ] #3 在 Claude Code 里只凭注入的标记块和 taskfold instructions，能完成建卡、改状态、改正文
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
18 §9 待验证：WSL 的 drvfs（/mnt/c）与 \\wsl$ 路径下 proper-lockfile 会误判锁为 compromised，在 CLI 文档/skill 与 README 中写明不支持这类路径。
<!-- SECTION:NOTES:END -->
