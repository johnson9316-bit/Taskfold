# 面板 UI/UX 修复交接

> 入口：问题全集见 [[20-面板UIUX评审]]；任务卡 `card-57`（`taskfold show card-57`）。
> 本文写于 2026-10-10，目的是换一场会话也能直接接着做。以磁盘实物为准：接手前先 `git log --oneline -5`、`git status`，别信本文的进度数字。

## 一、已完成

评审（107 条原始结论 → 合并 72 条）和第一轮修复已落盘并提交：

- `c8423f1` 修复面板评审中 9 条高严重度小改（UX-001～009）
- `eb63e51` 评审文档、资料库登记（`kb.uiux`，knowledge 区）、card-57

UX-001～008 已在 OpenClaw 里用真实 Chrome 独立复核通过；UX-009 只影响 VS Code，**没有实测**。

## 二、还没验的（需要人手）

1. **装 vsix 在 VS Code 里看**（`packages/vscode/taskfold-0.2.0.vsix` 已打好，gitignore 排除；丢了就 `npm run package -w packages/vscode` 重打）：
   - UX-001：深色/浅色/高对比度三种主题下，主按钮文字与背景配对正常。我们在 `vscode-theme.css` 加了一条覆盖规则把前景色还给 VS Code 的按钮配对，只读码推演过。
   - UX-009：「Taskfold: Open Board」→ 新建卡片，焦点直接落首个输入框，Tab/Shift+Tab 只在弹窗内循环，Esc 关闭后焦点回到触发按钮；点弹窗空白再按 Esc 仍能关；「新建项目」选「初始化已有项目」后焦点能进刚显示的路径输入框；卡片详情里 Tab 能走到 `<summary>`。
   - UX-005：点里程碑「完成」「归档」应弹 VS Code 模态确认框。
2. 手机宽度 / 820 / 560 一直没测（Chrome 窗口最大化，`resize_window` 不生效）。见第六节。

## 三、还剩什么（63 条）

按 [[20-面板UIUX评审]] 的编号，全部未做：

| 类别 | 条数 | 说明 |
| --- | --- | --- |
| 大改 | 12 | UX-010、011、042～049、071、072。每条文档第六节已给 2～3 个方案和代价，**还没选**。需要先选方案、必要时在 Design 画布出图，再动手 |
| 小改·令牌层 | 18 | 颜色、边框、焦点环、间距等，改 `host.css`、`taskfold-project.css` 变量区、`vscode-theme.css` |
| 小改·区域层 | 33 | 结构、aria、文案，改 `project-view.ts` 与两份 locale |
| 拍板小问题 | 13 | P-1～P-13，第七节，每条两个选项，**还没答**。其中一部分会阻塞对应的小改（比如字体栈 Inter vs Instrument Sans、Worktree 大小写） |

勾选页：https://claude.ai/artifact/Y4NLRE6ZjAm6NEpa3a1U4c （私有；选择存在浏览器 localStorage，点「生成摘要」得到三行文本）。页面是按 72 条做的，**已做的 9 条仍会显示为可勾选**，别重复选。

建议下一轮顺序：先答拍板题 → 令牌层剩余 18 条（一波，同改 CSS）→ 区域层按视图分波 → 大改逐个出方案后再做。

## 四、工作方法（照这个做，别重新摸索）

沿用 `.claude/skills/delegate`：主代理只写派工单、收结论，改代码和读实现交给子代理；**所有改动串行**，因为几乎都碰 `taskfold-project.css`、`project-view.ts`、locale 这几个文件。每波的收口：

1. 子代理自己跑 `npm run typecheck`、`npm run check:public-names`、`npm test`，只报退出码和断言数；`git diff --stat` 核范围。
2. `npm run build:control-ui`，然后 `openclaw gateway call plugins.controlUi.reload --params '{"pluginId":"taskfold"}'`，否则浏览器看到的是旧产物。
3. **另派独立的浏览器复核**，只给验收条件、不给结论，实测 computed style 和对比度。
4. 复核不过 → 用 `SendMessage` 接回原子代理改；两轮不过就重开并把失败原因写进新 prompt。

## 五、已踩过的坑（死路）

- **CSS 优先级不能口算**。第 1 波 UX-003 我和子代理都把 `taskfold-app .tf-btn--danger` 算成 (0,2,1)，实为 (0,1,1)，与 `taskfold-app .tf-btn` 打平被后者压住。typecheck 和测试全绿，是浏览器复核抓出来的。以后样式类改动一律要浏览器实测 computed style。
- **内置浏览器面板（`mcp__Claude_Browser__*`）在这个用法下不可用**：面板必须保持前台，否则截图只有约 526×329、视口设置被清、登录态会掉。一律用 Claude in Chrome（`mcp__claude-in-chrome__*`），它在独立窗口里操作，不用你守着。
- **登录凭据**：Gateway 密钥只能你自己填，代理不代填。子代理遇到登录框必须停下。
- **读 localStorage 别泛搜**：一个复核员为找主题设置，用 JS 列出了匹配 theme/setting/openclaw 的键，返回里带出了宿主设备身份和 operator token 明文（只留在子代理会话记录里，没转述）。派工单里要写死「只读 `openclaw.control.settings.v1:wss://openclaw.local` 的 `themeMode` 一个字段」。令牌是否轮换由你定。
- **scratchpad 不可靠**：本轮中途有两份原始评审结论被清掉（原因没查明），靠主会话上下文重建。重要结论当场写进 `.taskfold/documents/需求/`，别只放 scratchpad。
- **`taskfold` CLI 不支持**挂里程碑和资料库登记。走 Gateway 方法：`taskfold.cards.moveMilestone`（需 `expectedRevision`）、`taskfold.projects.documents.create`（参数 boardId/key/section/type/title/target）。登记后 `section` 不能 update，只能删了重登。**不要手改 `.taskfold/` 的 JSON**。
- **弹窗组件在 OpenClaw 里是宿主的，不是我们的**：宿主已注册 `openclaw-modal-dialog`（wa-dialog + 原生 `<dialog>`），`components/modal-dialog.ts` 的 `customElements.get` 守卫让它在 OpenClaw 里是死代码，只在 VS Code 生效。在 OpenClaw 里想改弹窗的 Esc/焦点行为，要改的是传给宿主组件的属性（如 `label`），不是这个文件。
- **验证写操作类按钮**（如 UX-005 的完成/归档）：先把 `window.confirm` 换成「记录并返回 false」，确认换成功再点，同时拦 WebSocket send 看有没有 RPC 发出。OpenClaw 端 `confirm` 就是 `window.confirm`，VS Code 端走扩展模态框。
- **Chrome 自动翻译会污染复核**：页面被翻成中文，部分文字与实际值错位（UX 清单里有对应一条建议给 `taskfold-app` 加 `translate="no"`）。定位元素一律用 class/属性/computed style，别靠文案。复核时 UX-005 点完归档，按钮 `title` 读成空串，疑似同因，未查明。
- **切看板分组会写你本机的 `~/.openclaw/plugins/taskfold/projects.json`**（boardView），不在仓库里。评审时已约定切完复原到 `groupBy: milestone / sortBy: createdAt / asc`；以后复核再切分组，同样要复原并读回确认。
- **`npm test` 有一个已知的环境失败**：`test/e2e/control-ui-baseline.test.ts` 因 `webapp-testing` 的 venv 缺 `playwright`，与改动无关。其余 55 套件、430 条断言应全过。不要为它改业务代码。
- **无渲染测试设施**：仓库没有 jsdom/happy-dom，Lit 模板的渲染行为只能靠浏览器实测。别新建测试体系，除非你另有决定。

## 六、评审覆盖缺口（仍然存在）

- 820 / 560 宽度未测，1280 只是用 `max-width` 模拟（不触发媒体查询，宿主侧栏布局没测到）。想补测需要把 Chrome 的 Claude 窗口取消最大化。
- 真深色（系统本身深色）下的 warn/info/success 没测；宿主选 Dark + 系统浅色这个场景已测。
- 缺样本：无需求卡、流程图无关系边、无归档卡/已完成里程碑、无运行中的执行（Stop/Steer/会话预览）、无隐藏文档。
- VS Code 侧大多是静态推演，没有实测。

## 七、第一轮留下的遗留（未处理）

- 危险按钮悬停时边框被换成 accent 色（`taskfold-app .tf-btn:hover:not(:disabled)` 特异性 (0,3,1) 高于 danger 规则），文字仍是红色。要不要给 danger 单独写悬停边框是设计取舍。
- 浅色主按钮对比度从 5.17 降到 4.92（仍过 4.5）；OpenClaw 其他宿主主题（crt 等）的 `--bg` / `--accent` 配对没验。
- UX-006 项目卡 `role="button"` 后读屏读不到卡内目标和进度数字；要读出来得改成「标题是真按钮、点击区域铺满整卡」，改动更大。
- UX-008 缩放按钮的「□」字形含义不直观，只补了 aria-label，字形没改。
- UX-004 没有自动化测试，完全靠浏览器复核证明。
- 第 3 波 `modal-dialog.ts` 带了三处超出清单的改动（`a[href]`/`summary` 计入可聚焦、弹窗自身 `tabindex="-1"`、document 级 Esc 兜底），不想要兜底可删 `modal-dialog.ts` 里那个方法和对应 add/remove 两行。
- 卡片详情弹窗：UX-017 写的「详情弹窗聚焦标题或 ×」在 VS Code 侧没处理，需要的话在 `project-view.ts` 加 `autofocus`。

## 八、待你决定

1. 拍板题 P-1～P-13 和 12 个大改的方案选择。
2. 是否轮换宿主 operator token（见第五节）。
3. 要不要补测 820/560（取消最大化 Chrome 窗口）。
4. 设计系统 artifact（https://claude.ai/artifact/VNa5EP377LHTqqae1Ke6KL）在改完后要不要同步：本轮改了主按钮文字取色、danger 选择器、颜色分支的触发条件，`bundle.css`、`tokens.json`、README 都**还没同步**。

## 九、环境速查

- Node 必须 24：`export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"`（默认 22 会让 `npm install` 当场失败）。
- 面板地址 `https://openclaw.local/plugin?plugin=taskfold&id=taskfold`，本机 Gateway 在 `127.0.0.1:18789`。
- 本分支：`docs/openclaw-2026.9.4-enable-and-upstream-diff`。本轮两个提交都在这个分支上，没有 push。
- 其余本机环境事实见仓库根 `AGENTS.md`。
