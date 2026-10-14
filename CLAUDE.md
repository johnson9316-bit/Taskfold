# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Taskfold 是 npm workspaces monorepo：看板数据以 Markdown 文件存在各项目仓库的 `.taskfold/` 里，OpenClaw 插件、VS Code 扩展、独立 CLI 三个入口读写同一份文件。本机环境事实（Node ≥ 24.16 的硬要求、Gateway 重载、Control UI / Playwright / VS Code 验证的坑、`.taskfold/` 手改边界）见 [AGENTS.md](AGENTS.md)，这里不重复。

## 命令

```bash
npm run typecheck                  # 根 tsc；不含 packages/vscode/src/extension.ts，改它加跑 npm run typecheck -w packages/vscode
npm test                           # vitest，全量约 20s
npx vitest run test/card-phase.test.ts                     # 单个文件
npx vitest run test/status-registry.test.ts -t "default"   # 按名称过滤
npm run check:public-names         # 命名隔离 + 工具面一致性；加 `-- --fix` 按源码重写 manifest 的工具声明
npm run build                      # 后端 bundle + Control UI + CLI（单独跑：build:backend / build:control-ui / build:cli）
npm run package -w packages/vscode # 构建并打 .vsix
npm run pack:check                 # 复刻 ClawHub 打包并核对发布包文件清单
```

没有 lint / format 脚本。测试全在根 `test/`，不分包；全量输出里的 skipped 是三类可选项（缺 `backlog` CLI 的格式兼容测试、缺 Playwright venv 的 e2e、需 `TASKFOLD_BENCH=1` 的基准），属预期。

读写本仓库自己的卡片用 CLI：`node packages/cli/dist/taskfold.js …`（没有全局 `taskfold`，缺 dist 先 `npm run build:cli`），`instructions` 子命令打印完整用法。

## 架构

**数据是文件，真相源是项目主 checkout 的 `<repo>/.taskfold/`**：`cards/*.md`（Markdown + frontmatter，参照 Backlog.md 格式）、`milestones/*.md`、`config.yml`（`format_version`、项目自定义 `statuses`）、`documents/`（资料库登记 JSON，只登记路径；本仓库的文档正文放在 `documents/需求/`）、`attachments/<卡 uuid>/`；`.runtime/`（执行态、`changes.log`）与 `.locks/` 不入 Git。任何宿主在任何 worktree 里运行，`file-store-path-resolver.ts` 都把读写改到主 checkout，worktree 里的副本是过期快照。SQLite 运行时后端已下线，只读的 `sqlite-store.ts` 与 `sqlite-migration.ts` 只服务 `openclaw taskfold migrate-sqlite`。

**一个内核，三个入口，一套前端**

- `packages/core`：与宿主无关的存储 + 领域层，不单独构建——各入口的 esbuild 把它打进自己的产物，别的包用 `@taskfold/core/<文件>.js` 直接引用其 `src/*.ts`（无 barrel）。
  - 存储 `file-store*.ts`：`createTaskfoldFileStores()` 返回一组 `TaskfoldKeyedStore`（register / lookup / delete / entries / compareAndSwap）。写入靠两层文件锁（全局锁管 ID 分配与新建，每卡一把卡锁）加卡片 `revision` CAS，输了抛 `TaskfoldRevisionConflictError`。
  - 领域 `store-*.ts`：一条单继承链 `Core → Enrichment → Promote → Workflow → Notification → Project → Dispatch`，分文件只为切开评审边界。CLI 只用到 `Project` 为止，`Dispatch`（派发、批量、诊断）才带执行语义。
- `packages/openclaw`：OpenClaw 适配层（入口 `src/backend/index.ts`），注册 `taskfold.*` Gateway 方法、`taskfold_*` 工具、`openclaw taskfold` CLI、变更事件与 reconciler 服务、`subagent_ended` 钩子。`project-routed-stores.ts` 把每个项目路由到它自己的 `.taskfold/`。
- `packages/cli`：`taskfold` 命令，只做卡片读写与状态流转，是 AI 写卡片的通道。
- `packages/vscode`：扩展进程里直接调 core（`src/methods.ts`），Webview 里跑 `packages/ui`；每个工作区文件夹就是一个项目。
- `packages/ui`：Lit 看板，OpenClaw Control UI 与 VS Code Webview 共用，只经 `TaskfoldHost`（`host.ts`）与宿主对话——`openclaw-host.ts`、`vscode-host.ts` 各实现一份，`protocol.ts` 是 Webview⇄扩展的 postMessage 协议。前端发出的 `taskfold.*` method 名是两个宿主共同的契约：新增 method 要在 OpenClaw 的 `gateway*.ts` 和 VS Code 的 `methods.ts` 都实现，或用 `TaskfoldHostCapabilities` 开关关掉对应界面（VS Code 就没有执行、项目管理、`changes.wait`）。

**执行（OpenClaw 独有）**：卡片 → `card-execution.ts` 预览与确认 → `dispatcher.ts` 在宿主托管的 git worktree 里起 subagent。run 正常结束靠 `subagent_ended` 钩子回写；Gateway 重启等钩子收不到的情况由 `reconciler.ts` 定时对账，判活只看卡片自己的 claim 心跳（`lifecycle.ts`），因为本地路径加载的插件调不了 `runtime.gateway.request`（需求/15「信任门」一节）。

**构建产物**：`packages/openclaw/dist/index.js`（后端 bundle，`openclaw` 为 external）与 `dist/control-ui/`（`packages/ui` 的 bundle）入库，改了 core / openclaw / ui 源码后要 `npm run build`，提交时带上重建的产物。CLI 与 VS Code 的 `dist/`、`media/` 不入库。

## 约定与坑

- **格式版本门控**：`file-store-format.ts` 的 `TASKFOLD_FORMAT_VERSION` 让旧版 core 对新格式只读。凡是旧 core 照写会写坏数据的改动——目录布局、卡片 / 里程碑 md 格式、`.runtime` 与 `changes.log` 格式、`file-store-locks.ts` 的锁参数——都要同时 +1，新特性用惰性升级（首次写入才升）。
- **引擎不比较状态名**（需求/22）：状态名由项目在 `config.yml` 里自定义，引擎只认类别、role 与卡片标记。判断用 `cardPhase(card, registry)`，写入用 `phasePatch(card, phase, registry)`，取状态用 `status-registry.ts`；`TASKFOLD_STATUSES`（旧的九个固定状态）是过渡遗留，新代码不用它校验状态。`test/status-literals.test.ts` 会拦住 `card.status === "…"` 和补丁里的状态字面量。改造分步落地，进度看需求/22 文末「实施进展」。
- **导入后缀**：core / openclaw / cli / vscode 的相对导入写 `.js`（实际文件是 `.ts`，NodeNext 约定）；`packages/ui` 写 `.ts`。
- **公共命名**：插件对外一律 `taskfold` / `taskfold_*` / `taskfold.*`，活跃代码里不出现 `workboard` 字样（唯一例外是宿主 worktree API 要求的 `ownerKind: "workboard"`）。工具名以 `workspace-access.ts` 的 `TASKFOLD_TOOL_NAMES` 为准，manifest 的 `contracts.tools` 与 `toolMetadata` 跟着它走，用 `check:public-names -- --fix` 重写。
- **i18n**：Taskfold 自己的文案在 `packages/ui/src/i18n/locales/` 的 `taskfoldProject.*` 下，`en.ts` 和 `zh-CN.ts` 各写一份；漏写 zh-CN 不报错，只静默回退英文。两个文件里其余几千条是上游 Control UI 遗留，en / zh-CN 之间的键数差异不用补。
- **测试替身**：`vitest.config.ts` 把 `vscode` 别名到 `test/helpers/vscode-stub.ts`；起子进程的多进程测试用 `test/helpers/ts-resolve-hooks.mjs` 让 `./x.js` 回退到 `x.ts`。

## 设计文档

代码注释里的 `需求/NN-…` 指 `.taskfold/documents/需求/NN-….md`，入口 `需求/README.md`（其中 GSD 相关内容整体暂缓，不作实现依据）。动手前按需读：存储 / 锁 / 格式版本 → `16`、`18`；状态与阶段 → `22`；执行生命周期与并发补偿 → `15.7`、`15.8`；Control UI 注入 → `15.9`。
