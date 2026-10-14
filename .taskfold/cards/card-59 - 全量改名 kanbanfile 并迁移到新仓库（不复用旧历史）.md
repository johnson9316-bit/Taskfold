---
id: CARD-59
title: 全量改名 kanbanfile 并迁移到新仓库（不复用旧历史）
status: backlog
assignee: []
created_date: '2026-10-14 07:00'
updated_date: '2026-10-14 07:51'
labels:
  - 开源化
dependencies: []
priority: normal
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
<!-- SECTION:DESCRIPTION:END -->

## Taskfold

<!-- SECTION:TASKFOLD:BEGIN -->
{
  "uuid": "e04bff83-30e7-4f15-909d-169e0661fd72",
  "position": 2000,
  "createdAt": 1791961225857,
  "notes": "## 目标\n\n按 需求/23-开源化改造 §三（D3/D4/D6）全量改名 `kanbanfile` 并新开仓库迁移：新历史、单个初始 commit、不复用旧仓库。整体推迟到项目推出前执行（2026-10-14 用户决定）。\n\n## 前置\n\n- 占位注册完成（card-58，本卡依赖它）。\n- 已定前提（D4）：不做旧仓库原地改名、不写迁移/回退工具；无外部用户，三个自有项目手工处理。\n- D1 修订（2026-10-14）：内部资料全部保留——新仓库 curated 树 ≈ 现有全部内容，仅 `AGENTS.md` 的本机环境事实段须先去敏（已完成：本机部分拆到不入库的 `AGENTS.local.md`）。\n\n## 一、改名清单（全量）\n\n| 项 | 现在 | 改成 |\n| --- | --- | --- |\n| 产品名 | Taskfold | **Kanbanfile**（文案里写 Kanbanfile，标识符写 kanbanfile） |\n| GitHub | `johnson9316-bit/Taskfold` | `kanbanfile/kanbanfile`（新组织；旧仓库归档→删除） |\n| npm | 发布包 `@johnson9316-bit/taskfold`；内部包 `@taskfold/*`（private） | 发布包 `kanbanfile`；内部包 `@kanbanfile/*`（D3 选项②） |\n| ClawHub | `@johnson9316-bit/taskfold` | `kanbanfile` |\n| OpenClaw 插件 id | `taskfold` | `kanbanfile`（需重新 `plugins enable`，加载路径同步改） |\n| CLI 命令 | `taskfold` | `kanbanfile` |\n| 网关方法 / 工具前缀 | `taskfold.*` / `taskfold_*` | `kanbanfile.*` / `kanbanfile_*` |\n| 环境变量 | `TASKFOLD_*` | `KANBANFILE_*` |\n| 数据目录 | `.taskfold/` | `.kanbanfile/`（本仓库 + 另两个测试项目手工 mv；`config.yml` 的 `format_version` 按仓库规则提到 5） |\n| 插件项目注册表 | `~/.openclaw/plugins/taskfold/projects.json` | `~/.openclaw/plugins/kanbanfile/projects.json`（复制过去或重新登记） |\n| 卡片 ID 前缀 | `card-` | **不变** |\n| 守门脚本 | `check:public-names`（守 workboard→taskfold） | 规则改为守旧名（taskfold/workboard）残留 |\n| 本地 checkout 目录 | 目录名 Taskfold | 可选改名 kanbanfile（要同步 `plugins.load.paths` 与 `AGENTS.local.md`） |\n\n## 二、步骤\n\n1. 代码/文档全量改名（上表，除数据目录与注册表两项外全部）。\n2. 三个自有项目数据目录 `mv .taskfold .kanbanfile`（本仓库 + 另两个测试项目），`config.yml` 的 `format_version` 提到 5。\n   - **硬性提醒**：旧客户端找不到 `.taskfold/` 会当成空项目，甚至**新建一个空的 `.taskfold/` 继续写**（两边数据分裂）。先停写、备份、再 mv，三个项目三端同升。\n3. 新仓库：curated 树（D1 修订后 ≈ 全部内容；`AGENTS.md` 去敏已完成，本机部分不入库）→ 单个初始 commit → 推送；版本号从 `0.2.0` 起。\n4. 本地保留旧历史作归档分支（如 `archive/pre-rename`）；旧仓库去 GitHub 设为 **archive**（可逆窗口），新仓库发完第一个版本、确认无遗漏后再 **delete**（不可逆）。\n   - **顺序不可倒**：archive 可逆、delete 不可逆。\n\n## 三、验收\n\n- 三个项目数据正常；全量测试绿；CI/CodeQL 绿。\n- 旧名残留 grep 不到（`check:public-names` 兜底）。\n- 新仓库只有一个初始 commit、无本机路径与内部项目名。\n\n## 说明\n\n- 决策依据与命名调研（含商标核查）：需求/23-开源化改造 §4.4-4.6。\n- 本卡正文即完整执行清单；23 号文档只保留决策记录，不再重复步骤。",
  "metadata": {
    "automation": {
      "boardId": "flowboard"
    }
  }
}
<!-- SECTION:TASKFOLD:END -->
