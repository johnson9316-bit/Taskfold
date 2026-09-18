# AGENTS.md

面向 Claude Code / Codex 等 AI 开发者的本地环境事实。本文件**不随 ClawHub 包发布**（不在 `package.json` 的 `files` 白名单里），只服务于在这台机器上开发 Taskfold 的场景；面向外部用户的安装/开发说明仍以 `README.md` 为权威入口（见下方「文档地图」）。

## 环境事实

核实日期：2026-09-18。

| 项 | 值 |
| --- | --- |
| OpenClaw CLI / Gateway 版本 | `2026.9.4` (`3a9d69d`)，均已核实一致 |
| Gateway 运行方式 | systemd user service，`127.0.0.1:18789`，loopback-only |
| Taskfold 加载方式 | `~/.openclaw/openclaw.json` 的 `plugins.load.paths` 指向本地 checkout，**不是**通过 npm/ClawHub 安装 |
| 本地 checkout 路径 | `/home/john/src/personal/Taskfold` |
| `enabledByDefault` | `false`（`openclaw.plugin.json`）—— 每次插件 id 改名（Flowboard → Taskfold）都要手动 `openclaw plugins enable taskfold`，宿主不会自动跟随 |
| Capability shape | `non-capability` —— `enable` 不需要 `--accept-capabilities` |
| Trust 状态 | `reason=record-missing`，本地路径加载会有一条 WARN「can't verify where this plugin came from」，属预期，不是错误 |
| 数据库 | `~/.openclaw/plugins/taskfold/taskfold.sqlite` |

## 与内置 workboard 并存

OpenClaw 2026.9.4 起官方内置了 stock `workboard`（`origin: bundled`，默认 enabled）。Taskfold 是它 2026-07-28（upstream `78d6c6c`）的 fork，此后独立演进、从不合并上游（见 `UPSTREAM.md`）。**两者并存是设计意图，不是需要清理的冗余** —— README「Data and Execution」一节已写明 "The bundled OpenClaw Workboard can remain enabled."

隔离面已核实无冲突：

- RPC 方法前缀 `taskfold.*` vs `workboard.*`
- 工具前缀 `taskfold_*` vs `workboard_*`
- 命令别名 `taskfold` vs `workboard`
- 各自独立的 SQLite 数据库
- Webhooks 路由 `/plugins/webhooks/workboard` 绑定的是 stock workboard，与 Taskfold 无关

`npm run check:public-names`（`scripts/check-public-names.mjs`）是这条隔离边界的守门人，会校验没有未迁移的公共 `workboard` 残留名，且 manifest 声明的工具面与源码工具名集合完全一致。

上游 `78d6c6c`（fork 点）→ `3a9d69d`（`v2026.9.4`，本机当前版本）的具体差异、新增能力、以及是否值得 Taskfold 借鉴，详见 [[需求/15-上游2026.9.4差异评估]]（中文，规划层文档）。**两版真实 TS 源码已拉取存放在 `tpm/openclaw-<短SHA>-workboard-source/`**（被 `.gitignore` 排除），openclaw 是公开 MIT 仓库（`github.com/openclaw/openclaw`），下次升级后按该文档「对比方法」一节的命令重新拉取一份新快照即可继续对照，不用整仓克隆。

结论摘要（已用真实源码核对，不是压缩产物推测）：功能层面 Taskfold 已覆盖 stock 全部工具且更丰富，无需追赶；工作区沙箱访问控制、变更事件轮询这两项 Taskfold 已经具备等价设计，不是缺口。**2026-09-18 已定 9 项要做**（子表索引、归档诊断、manifest 补 `cliCommands`/`doctorContract`、执行引擎放开、会话捕获 captureSession、板级自动化联动、会话生命周期两阶段落地、乐观并发+补偿+owner slot、Control UI 迁移到宿主原生注入），逐项实现要点见文档正文。`openclaw plugins validate`/`plugins build` 失败评估后决定不修——这两个命令目前只支持一种全新的声明式 `defineToolPlugin()` 插件写法（全仓只有 `llm-task` 一个扩展用它），stock `workboard` 大概率也过不了，**跟能不能装插件无关**（那是开发期工具，不参与 `plugins install`/`enable` 的安装加载路径）。

## 四份历史数据库

`Flowboard → Taskfold` 改名迁移已经跑完，`~/.openclaw/plugins/` 下留有四份历史数据：

| 文件 | 大小 | 状态 |
| --- | --- | --- |
| `taskfold/taskfold.sqlite` | ~600K | **在用** |
| `flowboard/flowboard.sqlite` | ~784K | 迁移前回滚副本，`sqlite-store.ts` 的 `copyLegacyFlowboardDatabase` 只在目标库不存在时才会读它，正常运行不会再碰它 |
| `gsdboard/gsdboard.sqlite` | ~164K | 更早一次改名留下的旧数据，与当前迁移路径无关 |
| `workboard/workboard.sqlite` | ~204K | 属于 stock `workboard` 插件自己的数据，与 Taskfold 无关 |

已核实：`taskfold_*` 与 `flowboard_*` 的 22 张对应表行数一致（`cards` 102、`boards` 4、`milestones` 12、`project_documents` 58），且 `taskfold_schema_migrations` 比 `flowboard_schema_migrations` 更新（`schema-8` vs `schema-7`）—— 数据没有丢失，迁移已完成。**后续不要再动 `flowboard`/`gsdboard`/`workboard` 这三份数据库。**

## 本地安装与重载回路

```bash
openclaw plugins install --link /home/john/src/personal/Taskfold
openclaw plugins enable taskfold
openclaw gateway restart
openclaw plugins inspect taskfold --runtime
openclaw plugins doctor
```

如果 checkout 已经在 `plugins.load.paths` 里（本机现状即是如此），跳过第一条 `install --link`，直接 `enable` + `restart` 即可。README「Development」一节的等价命令用的是占位路径，这里补上本机真实路径。

## 文档地图

| 文档 | 定位 |
| --- | --- |
| `README.md` | 面向外部用户/发布产物的权威安装与开发说明（会被打进 ClawHub 包，不要往里塞本机路径或临时排查结论） |
| `VERIFICATION.md` | 按日期只增的验证台账，历史快照性质，早期结论可能已被后文推翻 —— 不要拿它当「当前状态」用 |
| `docs/CLAW_HUB_PUBLISHING.md` | ClawHub 发布流程 |
| `需求/` | 中文规划文档体系，Obsidian 风格 `[[wiki-link]]` 互链，入口 `需求/README.md` |
| `需求/6-OpenClaw集成.md` | 插件安装/运行/分发的规划记录（注意：其「已在 2026.7.1-2 验证」的记载已过期，本机现为 2026.9.4，尚待重新验证） |
| `需求/15-上游2026.9.4差异评估.md` | 上游 workboard 版本差异评估，见上文 |
| `reports/plugin-inspector-*` | 工具生成的静态兼容性扫描，`Generated: deterministic`，**不执行插件代码**，不能替代 `openclaw plugins validate` 之类需要实际加载的检查 |
| `tpm/openclaw-<短SHA>-workboard-source/` | 上游 `workboard`/`workboard-contract` 真实源码快照，`.gitignore` 排除，供对照评估用，不参与构建 |
| 本文件（`AGENTS.md`） | 本机开发环境事实，不随包发布 |

## 其他已知但未整理的本机路径依赖

以下路径目前只硬编码在代码/文档里，尚无正式说明，供后续排查时参考：

- `scripts/backfill-procloud-m3.mjs` 顶部硬编码 `PLANNING_ROOT = "/home/john/src/lz/procloud/.planning"`、`DOCS_ROOT = "/home/john/src/lz/procloud/docs"`，是一次性数据回填脚本，无 npm script 入口。
- `需求/8.8-工作流/工作流迁移.md` 提到参考仓库 `/home/john/src/other/kandev`。
