---
id: CARD-57
title: 面板 UI/UX 评审与优化
status: running
assignee: []
created_date: '2026-10-09 09:33'
updated_date: '2026-10-10 05:07'
labels:
  - ui
  - design
milestone: 1d106956-b3ac-453e-bedb-0e495a8af4c7
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
  "uuid": "e5423e27-167a-495f-a536-e79a126fec3f",
  "position": 1000,
  "createdAt": 1791538416122,
  "notes": "原方案：~/.claude/plans/1-https-openclaw-local-mellow-sun.md（截图评审出清单 → 大改项 Design 画布 → 改 packages/ui/src/）。\n执行方式：delegate 模式，计划见 ~/.claude/plans/claude-skills-delegate-home-john-claude-woolly-pike.md。\n拆法：第 1 批盘点 = A 静态审计（只读源码）+ B1 看板区截图评审 + B2 其余截图评审（B1/B2 共用内置浏览器，串行）→ 合并成 .taskfold/documents/需求/20-面板UIUX评审.md → 停下等用户挑选 → 大改项出 Design 画布 → 改代码按文件串行分波（令牌层 → 按区域）→ 同步设计系统 artifact。\n基线：开工时 git 工作树干净（2026-10-09）。不 commit、不 push。\n\n2026-10-09 进度：探针通过（子代理可用内置浏览器、已登录、零 iframe）。已派第 1 批 A 静态审计 + B1 看板区截图评审；B2 待 B1 完成后派（共用浏览器）。注意：taskfold CLI 不支持挂里程碑和登记资料库文档，这两项需走宿主。\n\n2026-10-09 进度：A 静态审计完成（32 条）、B1 看板区评审完成（34 条 + 对比度实测）；结论暂存会话 scratchpad review/，合并后落 20 号文档。浏览器改用 Claude in Chrome（内置浏览器面板无法保持前台、会掉登录）。用户裁决：评审可切看板分组，切完复原（projects.json 的 updatedAt/mtime 变动可接受）。已知缺口：Chrome 窗口最大化 resize 无效，820/560 未测、1280 为 max-width 模拟。B2 已派。\n\n2026-10-10 进度：B2 评审完成（41 条）。关键修正：OpenClaw 宿主已注册同名 openclaw-modal-dialog，packages/ui/src/components/modal-dialog.ts 因 customElements.get 守卫在 OpenClaw 里是死代码（只在 VS Code 生效），推翻 A 审计第 16 条在 OpenClaw 侧的结论；OpenClaw 侧弹窗 Tab 循环/Esc/焦点归还实测通过，只剩打开后焦点不进首字段和无可访问名称。B2 另发现 .tf-btn--danger 因优先级低于 taskfold-app .tf-btn 完全未生效。已派合并子代理写 .taskfold/documents/需求/20-面板UIUX评审.md。待办：资料库登记该文档、卡片挂里程碑（CLI 不支持，需走宿主）。\n\n2026-10-10 进度：三份评审已合并为 .taskfold/documents/需求/20-面板UIUX评审.md（72 条：高 11/中 38/低 23；大改 12 条各给 2-3 个方案；小改 60 条其中令牌层 21、区域层 39；拍板小问题 13 条 P-1..P-13）。VS Code 侧结论多数为静态判断、未实测。死路：scratchpad 中 A/B1 原始结论曾被清掉，已重建；以 20 号文档为准。待办：用户在勾选页挑选 → 大改项出 Design 方案 → 分波串行改代码。资料库登记与里程碑挂载仍需走宿主。\n\n2026-10-10 进度：已挂里程碑「后续调整（二）」、20 号文档已登记到资料库 knowledge 区（kb.uiux，用户确认分区）。已发布勾选页 https://claude.ai/artifact/Y4NLRE6ZjAm6NEpa3a1U4c（私有，小改 60/大改 12/拍板 13），交互验收中。下一步：等用户贴回选择摘要 → 大改项出 Design 画布方案 → 令牌层先行、区域层随后，全部串行；每波先过 typecheck/test/check:public-names，再由独立浏览器复核。\n\n2026-10-10 第 1 波（令牌层 UX-001/002/003）代码已改：host.css（主按钮文字 var(--bg)、颜色分支改跟 html[data-theme-resolved]、兜底 :where() 保持 (0,0,1)）、taskfold-project.css:1431（danger 加 taskfold-app 前缀）、vscode-theme.css（把 VS Code 主按钮前景覆盖回 --accent-foreground）。typecheck/check:public-names 通过；npm test 唯一失败是 test/e2e/control-ui-baseline.test.ts 因 webapp-testing venv 缺 playwright（环境问题，与改动无关，其余 430 条通过）。预期对比度：深 6.29、浅 4.92（浅色从 5.17 略降）。已知遗留：danger 按钮 hover 时边框仍被 .tf-btn:hover (0,3,1) 改成 accent；其他宿主主题（crt 等）的 --bg/--accent 配对未验。浏览器独立复核进行中，通过前不进第 2 波。VS Code 侧仅读码推演，待用户装 vsix 验。\n\n2026-10-10 第 1 波通过独立浏览器复核（第一次 UX-003 不通过：我与子代理都把 taskfold-app .tf-btn--danger 的特异性算成 (0,2,1)，实为 (0,1,1)，与 taskfold-app .tf-btn 打平被后者压住；改为 taskfold-app .tf-btn.tf-btn--danger (0,2,1) 后复核通过）。实测：深色主按钮 6.29、浅色 4.92；宿主 Dark 时 color-scheme=dark；danger 文字深 6.16/浅 5.74 且为红色系。教训：特异性要用脚本逐条数，不能口算；类型检查和测试看不出样式失效，必须浏览器实测。遗留（未处理，待用户定）：danger 按钮 hover 时边框被换成 accent；其他宿主主题（crt 等）的 --bg/--accent 配对未验。已派第 2 波（UX-004~008，project-view.ts + locale）。\n\n2026-10-10 第 2 波（区域层 UX-004~008）通过独立浏览器复核：UX-004 55/55 卡的「移至」下拉与所在列一致；UX-005 用已有 taskfoldHost().confirm（OpenClaw=window.confirm，VS Code=扩展模态框），复核时把 window.confirm 换成返回 false，点完成/归档均记录到确认文案且无 RPC 发出；UX-006 项目卡 role=button+tabindex+aria-label+Enter/Space，焦点环对比 4.59~4.92；UX-007/008 aria-label 到位。未做：UX-004 无渲染测试（仓库无 DOM 测试设施，不新建）。已知取舍：UX-006 的 role=button 会让读屏不读卡内进度；改成标题 button+伪元素铺满是更大改动，未做。疑点：复核时归档按钮 title 点后读成空串，疑似 Chrome 自动翻译，未查明。已派第 3 波（UX-009 modal-dialog.ts，仅 VS Code 生效，需用户装 vsix 验）。\n\n2026-10-10 第 3 波（UX-009 modal-dialog.ts，仅 VS Code 生效）代码已改：打开聚焦首个可聚焦元素、Tab 陷阱、关闭还焦点、document 级 Esc 兜底（仅焦点在弹窗外时触发）；customElements.get 守卫原样保留，OpenClaw 路径不受影响（读码推断，未实测）。超出清单的三处：a[href]/summary 计入可聚焦、弹窗自身 tabindex=-1、document 级 Esc 兜底。已产出 packages/vscode/taskfold-0.2.0.vsix（688KB，gitignore 已排除），未安装。全部 9 条（UX-001~009）已完成，总检：typecheck 0、check:public-names 0、npm test 仅 e2e/control-ui-baseline 因缺 playwright 失败（430 通过）。未 commit、未 push。待用户：在 VS Code 里装 vsix 按清单验 UX-001（主按钮配色）、UX-009（弹窗焦点）、UX-005（确认框）。待定：danger hover 边框；其他宿主主题主按钮对比；UX-006 读屏读不到卡内进度。",
  "startedAt": 1791538416122,
  "metadata": {
    "automation": {
      "boardId": "flowboard"
    }
  }
}
<!-- SECTION:TASKFOLD:END -->
