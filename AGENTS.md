# AGENTS.md

面向 Claude Code / Codex 等 AI 开发者的本地环境事实。本文件**不随 ClawHub 包发布**（不在 `package.json` 的 `files` 白名单里），只服务于在这台机器上开发 Taskfold 的场景；面向外部用户的安装/开发说明仍以 `README.md` 为权威入口（见下方「文档地图」）。

## 环境事实

核实日期：2026-09-18。

| 项 | 值 |
| --- | --- |
| OpenClaw CLI / Gateway 版本 | `2026.9.4` (`3a9d69d`)，均已核实一致 |
| **Node 版本（易踩）** | 开发必须 `>=24.16.0`——`openclaw@2026.9.4` 的 `preinstall` 硬性要求（它自己的 `engines` 是 `>=24.16.0 <25 \|\| >=26.1.0`）。**本机默认 node 是 `v22.22.3`，直接跑 `npm install` 会当场失败。** 已加 `.nvmrc`（`24.21.0`，不进发布包）与 `engines.node`，先 `nvm use` 或 `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"` 再跑任何 npm 命令 |
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

结论摘要（已用真实源码核对，不是压缩产物推测）：功能层面 Taskfold 已覆盖 stock 全部工具且更丰富，无需追赶；工作区沙箱访问控制、变更事件轮询这两项 Taskfold 已经具备等价设计，不是缺口。**2026-09-18 已定 9 项要做**（子表索引、归档诊断、manifest 补 `cliCommands`/`doctorContract`、执行引擎放开、会话捕获 captureSession、板级自动化联动、会话生命周期两阶段落地、乐观并发+补偿+owner slot、Control UI 迁移到宿主原生注入），逐项实现要点与**当前进展**见该文档「实施进展」一节（1/2/3/5 已落地，4 经核实本来就不需要做，7/8 已出设计文档 [[需求/15.7-会话生命周期设计]]／[[需求/15.8-并发与补偿设计]]，9 进行中见 [[需求/15.9-ControlUI注入调查]]）。**第 6 项经核实不可行**（不是技术难度，是架构前提）：上游触发 cron 的唯一调用点走 `runtime.gateway.request`，而那道信任门只认 `origin="bundled"` 或 `trustedOfficialInstall`，Taskfold 走本地路径加载（`origin="config"`）拿不到。**这道门已经咬过三次**（`b7abc5c` 的 sessions.list 对账、第 7 项路线 A、第 6 项），已固化成一条筛选规则记在该文档「信任门」一节——以后评估任何上游机制，先 grep 它的实现里有没有 `gateway.request`，有就直接判不可行。反向推论：hook（`api.on(...)`）不走这道门，「宿主事件→插件」方向一直可用。**另两项有意挂起**：并行执行方案（[[需求/15.10-并发执行模型调查]]，四选一待定，等实际使用一段时间再决定）与第 8 项的 owner slot 子项（与前者动同一段代码）——查明上游 stock workboard 同样是串行，而并行零代码即可开启（给卡填不同 `agentId`）。`openclaw plugins validate`/`plugins build` 失败评估后决定不修——这两个命令目前只支持一种全新的声明式 `defineToolPlugin()` 插件写法（全仓只有 `llm-task` 一个扩展用它），stock `workboard` 大概率也过不了，**跟能不能装插件无关**（那是开发期工具，不参与 `plugins install`/`enable` 的安装加载路径）。

## Control UI 的本机验证方法

Control UI 已迁到宿主原生注入（`browser/` → `dist/control-ui/`，见 [[需求/15.9-ControlUI注入调查]]）。验证面板要注意四件事，前两件是环境坑、后两件是机制：

1. **地址是 `https://openclaw.local/`**（hosts 映射到 `127.0.0.1`，443 端口有反向代理转发到 Gateway 的 18789），自签证书。
2. **必须绕过代理**：本机有 `HTTP_PROXY` 指向 `127.0.0.1:7897`，curl 和 Playwright 都会走它然后失败。curl 加 `--noproxy '*'`；Playwright 要在脚本里 `os.environ.pop()` 掉 `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY` 及其小写形式，并给 chromium 传 `args=["--no-proxy-server","--proxy-bypass-list=*"]`，光靠 `proxy={"server":"direct://"}` 挡不住。再加 `ignore_https_errors=True`。
3. **改了前端产物必须显式刷新宿主缓存**，否则浏览器拿到的还是旧产物（宿主的 `browserCatalogs` 初始化后不再感知磁盘变化）：

   ```bash
   npm run build:control-ui
   openclaw gateway call plugins.controlUi.reload --params '{"pluginId":"taskfold"}'
   ```

   这是 UI-only 刷新（宿主源码注释原文 "never imports or replaces backend plugin code"），不重启 Gateway、不重载后端。

4. **原生注入依赖一个实验开关**，本机已开启：`~/.openclaw/openclaw.json` 的 `gateway.controlUi.experimental.customPlugins: true`（对应 Settings → Agents & Tools → Labs → Custom plugin UI）。这是**所有 user-installed 插件的统一门槛**，不是 Taskfold 特有——只有 `origin: bundled` 的插件豁免。改这个键需要重启 Gateway 并刷新已打开的标签页。开关关掉后 `controlUi.entry` 字段变惰性，但旧 iframe 管线已删除，所以关掉就没有面板了（后端工具/CLI/网关方法不受影响）。

登录用 Gateway token（`gateway.auth.token`）填进页面的「Gateway 密钥」框（`#login-gate-credential`）。判断原生注入是否生效：侧边栏 Taskfold 项指向 `/plugin?plugin=taskfold&id=taskfold`（旧 iframe 是 `/plugins/taskfold/`），面板区域应该**零 `<iframe>`**。

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

## VS Code 扩展（packages/vscode）

本机 VS Code 是 1.138。打包出自包含的 `.vsix`，由用户自己安装进真实的 VS Code（代理不代装）：

```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"
npm run package -w packages/vscode      # → packages/vscode/taskfold-0.2.0.vsix
code --install-extension /home/john/src/personal/Taskfold/packages/vscode/taskfold-0.2.0.vsix
```

在隔离环境里无头验收时，有三处容易踩坑：

1. **HOME 也要隔离**。只带 `--user-data-dir` / `--extensions-dir` 不够：VS Code 仍会改写 `~/.vscode/argv.json`，并打开 `~/.vscode-shared/sharedStorage/`。所以启动时要设 `HOME`、`XDG_*` 指向 scratchpad，另加 `--password-store=basic`。启动参数：直接调用 Electron 可执行文件 `/usr/share/code/code`，带 `--ozone-platform=headless --remote-debugging-port=<端口>`。
2. **只用一条 CDP 连接**。Playwright 断开后，视口会恢复成 400×270，再次连接时也看不到之前已打开的 Webview 的 frame。所以要在同一条连接里依次 `set_viewport_size`、执行「Taskfold: Open Board」、完成全部操作。
3. **对话框要能在页面里操作**。在隔离用户设置里写 `"window.dialogStyle": "custom"`，模态框就渲染成 workbench 里的 `.monaco-dialog-box`，可以截图和点击。

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
