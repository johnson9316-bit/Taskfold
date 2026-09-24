---
id: TASK-3
title: core：运行态移出卡片 md + contentHash 外部修改检测
status: Done
assignee: []
created_date: '2026-09-24 09:29'
updated_date: '2026-09-24 10:30'
labels:
  - core
  - storage
milestone: m-0
dependencies:
  - TASK-2
references:
  - 需求/18-多宿主架构.md
priority: high
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
按 18 §3.7：先按实际写入频率核实字段清单（初步 claim/execution/sessionKey/runId/taskId，另查 delivery/events），移到 gitignore 的 .taskfold/.runtime/cards/<id>.json；revision（整数，16 R3）与 contentHash 同放运行态；卡锁内重算 hash，不一致先 revision+1 再 CAS；运行态丢失按当前 md 初始化。核实 16 §6.2 的 Backlog.md 格式兼容契约测试是否要调整。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 手工改卡片 md 后，持旧 revision 的写入被判冲突（测试先红后绿）
- [x] #2 claim/心跳写入不改动任何 Git 跟踪文件（git status 干净）
- [x] #3 删除 .runtime/ 后卡片内容完整、revision 重新初始化
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
承接 18 §3.3 表第 7 行：file-store-reconcile.ts:114,145 的内存哈希表 + noteOwnWrite 自写标记，改为按 core 返回的 revision/contentHash 识别自己的写入。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
运行态（claim/execution/sessionKey/runId/taskId/events + 整数 revision + contentHash + updatedAt）迁到 gitignore 的 .runtime/cards/<id>.json（file-store-card-runtime.ts）。卡锁内先写 md 再写运行态；只改运行态时 md 字节不变。锁内重算 contentHash，不一致先 revision+1 再 CAS。旧格式兼容读取、下次写入迁出；从旧格式初始化 revision 取 r+1。reconciler 去掉内存哈希表与 noteOwnWrite，改用运行态 hash，重盖只写运行态且在卡锁内（tryWithTaskfoldCardLockSync）。#1/#2/#3、旧格式兼容、旧格式冲突均先红后绿；npm test 295 通过。
<!-- SECTION:FINAL_SUMMARY:END -->
