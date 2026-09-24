/**
 * Taskfold Control UI 基线 e2e（第 1 期：UI 仍连 SQLite 后端）。
 *
 * 背景（需求/16-文件存储改造.md 10.2）
 * ------------------------------------------------------------
 * 第 1 期只把存储层实现换成文件，**不切生产路径**（第 3 期才切）。这里跑的
 * 仍是 SQLite 后端驱动的 Control UI，价值是把"迁移前用户在界面上能看到
 * 什么"固化成可执行断言——等第 3 期真的切到文件后端后，同一套用例原样
 * 重跑，一旦某个数字、某一列、某个字段变了，就说明"只换存储层、界面行为
 * 不变"这件事没做到。因此下面的断言全部是"用户可观察到的界面事实"，不
 * 断言任何只在 SQLite 下才成立的实现细节。
 *
 * 依赖与启用方式（本机可用，CI 上没有，必须能被优雅跳过）
 * ------------------------------------------------------------
 * - 一个正在运行、监听 127.0.0.1:18789 的 OpenClaw Gateway，且已加载
 *   Taskfold 插件：http://127.0.0.1:18789/plugin?plugin=taskfold&id=taskfold
 * - webapp-testing skill 自带的 Playwright venv：
 *   ~/.claude/skills/webapp-testing/.venv/bin/python
 *   （系统 python 没装 playwright，用不了；可用 TASKFOLD_E2E_PYTHON 覆盖路径）
 * - 令牌通过 `openclaw gateway auth-token --show` 在测试运行时现取，绝不
 *   写入任何文件或提交到仓库。该命令在非交互终端里会被拒绝，所以这里用
 *   `script -qec "..." /dev/null` 套一层伪终端，和人工验证时的方式一致。
 *
 * 以上任一依赖缺失，本文件里的用例会在 beforeAll 里探测到并通过
 * `ctx.skip()` 整体优雅跳过（显示为 skipped，不是 failed），不会把
 * `npx vitest run` 变红。真正跑起来时（本机已确认可用），断言必须通过。
 *
 * 只读边界
 * ------------------------------------------------------------
 * 不新建、编辑、删除任何卡片 / 项目 / 里程碑，不写数据库、不改 Gateway
 * 配置。巡检脚本（control-ui-recon.py）里唯一会临时改动的是"分列方式 /
 * 排序方式 / 排序方向 / 包含已归档 / 语言"这 5 个视图控件，且在脚本内
 * 闭环复原；下面 "环境未残留副作用" 这条用例专门断言复原是否成功——
 * 如果哪天复原失败，这里会显式失败提醒人去看，而不是悄悄留下脏状态。
 */

import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GATEWAY_ORIGIN = "http://127.0.0.1:18789";
const PLUGIN_URL = `${GATEWAY_ORIGIN}/plugin?plugin=taskfold&id=taskfold`;
const RECON_SCRIPT = path.join(__dirname, "control-ui-recon.py");
const PYTHON_BIN =
  process.env.TASKFOLD_E2E_PYTHON ??
  path.join(os.homedir(), ".claude/skills/webapp-testing/.venv/bin/python");
const RESULT_LINE_PREFIX = "TASKFOLD_E2E_RESULT ";

interface ReconResult {
  ok: boolean;
  fatalError?: string;
  loginOk?: boolean;
  sectionErrors?: Record<string, string>;
  projectBadgeTotal?: { before: number | null; after: number | null };
  projectCardCountVisible?: { before: number; after: number };
  sidebarProjectCounts?: {
    before: Record<string, number>;
    after: Record<string, number>;
  };
  archiveToggleRestored?: boolean;
  milestoneColumns?: string[];
  statusColumns?: Array<{ name: string; cardCount: number | null }>;
  viewPrefsRestored?: {
    original: Record<string, unknown>;
    matches: boolean;
    final: Record<string, unknown>;
  };
  languageOptions?: Array<[string, string]>;
  languageSwitchRoundTrip?: { switchedTo: string; restoredTo: string };
  cardDetail?: {
    title: string;
    foundMarkers: Record<string, boolean>;
    allMarkersFound: boolean;
    brokenValuePatternsFound: string[];
    assigneeFieldValue: string | null;
  };
  consoleErrors?: Array<{ type: string; text: string }>;
  network4xx5xx?: Array<{ status: number; url: string }>;
  websocketUrls?: string[];
}

interface ProjectCounts {
  /** 全部项目数（含已归档），对应"全部项目"徽标——不受归档勾选框影响。 */
  total: number;
  /** 未归档项目数，对应归档勾选框未勾选时项目列表页可见的项目卡片数。 */
  active: number;
}

interface SuiteState {
  available: boolean;
  skipReason: string;
  facts: ReconResult | null;
  /** 实时读取的项目数基线（TASK-12：不写死本机某一时刻的项目数量）。 */
  projectCounts: ProjectCounts | null;
}

const state: SuiteState = { available: false, skipReason: "", facts: null, projectCounts: null };

/** 探活 Gateway；超时或非 2xx 都算不可用，不抛错——交给调用方决定是跳过。 */
async function probeGateway(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(GATEWAY_ORIGIN, { signal: controller.signal });
    clearTimeout(timer);
    return res.status < 500;
  } catch {
    return false;
  }
}

/**
 * 现取 Gateway 令牌，绝不落盘。`openclaw gateway auth-token --show` 在非
 * 交互终端会被拒绝执行，用 `script -qec` 套一层伪终端绕过这个限制——和
 * 人工验证这套 UI 时用的方式完全一致。
 *
 * 实测发现：Vitest worker 进程自带 `VITEST=true`（以及 `VITEST_WORKER_ID`
 * 等）环境变量，`openclaw` 会探测到这个变量并直接不打印令牌那一行就退出
 * （大概是不想在测试/CI 环境里意外把真实令牌吐到日志里，属于合理的自我
 * 保护）。所以这里生成一份剔掉 VITEST 相关变量的干净环境变量表，再拿它
 * 去起子进程，而不是直接照抄 process.env。
 */
function fetchGatewayToken(): string | null {
  try {
    execSync("command -v script", { stdio: "ignore" });
  } catch {
    return null;
  }

  const cleanEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("VITEST")),
  );

  try {
    const stdout = execSync('script -qec "openclaw gateway auth-token --show" /dev/null', {
      encoding: "utf-8",
      timeout: 20_000,
      stdio: ["ignore", "pipe", "ignore"],
      env: cleanEnv,
    });
    const lines = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
    const token = lines.at(-1) ?? "";
    // Gateway 令牌目前是十六进制字符串；粗校验一下，避免把 banner 残留当令牌用。
    return /^[0-9a-f]{16,}$/i.test(token) ? token : null;
  } catch {
    return null;
  }
}

/**
 * 现取项目列表的真实计数（含 / 不含已归档），作为下面项目数断言的基线，
 * 而不是写死本机某一时刻的项目数量——本机项目数会随时间增减，写死的数字
 * 每次都要人工排除（TASK-12）。复用 fetchGatewayToken 同样的伪终端 + 剔除
 * VITEST 环境变量的绕过方式：`openclaw gateway call` 在 Vitest worker 的
 * VITEST 环境变量下同样会不打印结果就静默退出（实测，与 auth-token 一致）。
 *
 * 只读：`taskfold.projects.list` 是查询方法，不新建/删除任何项目。
 */
function fetchProjectCounts(token: string): ProjectCounts {
  const cleanEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("VITEST")),
  );
  const countProjects = (includeArchived: boolean): number => {
    const cmd =
      `script -qec "openclaw gateway call taskfold.projects.list --token ${token} ` +
      `--json --params '{\\"includeArchived\\":${includeArchived}}'" /dev/null`;
    const stdout = execSync(cmd, {
      encoding: "utf-8",
      timeout: 20_000,
      stdio: ["ignore", "pipe", "ignore"],
      env: cleanEnv,
    });
    const parsed = JSON.parse(stdout) as { projects: unknown[] };
    return parsed.projects.length;
  };
  return { total: countProjects(true), active: countProjects(false) };
}

function runRecon(token: string): ReconResult {
  const artifactDir = path.join(os.tmpdir(), "taskfold-control-ui-e2e");
  const stdout = execFileSync(PYTHON_BIN, [RECON_SCRIPT], {
    encoding: "utf-8",
    timeout: 90_000,
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
      TASKFOLD_E2E_TOKEN: token,
      TASKFOLD_E2E_URL: PLUGIN_URL,
      TASKFOLD_E2E_ARTIFACT_DIR: artifactDir,
    },
  });
  const resultLine = stdout
    .split("\n")
    .filter((line) => line.startsWith(RESULT_LINE_PREFIX))
    .at(-1);
  if (!resultLine) {
    throw new Error(`巡检脚本没有输出预期的结果行，完整 stdout：\n${stdout}`);
  }
  return JSON.parse(resultLine.slice(RESULT_LINE_PREFIX.length)) as ReconResult;
}

beforeAll(async () => {
  if (process.env.TASKFOLD_E2E_DISABLE) {
    state.skipReason = "已通过 TASKFOLD_E2E_DISABLE 显式禁用";
    return;
  }
  if (!fs.existsSync(PYTHON_BIN)) {
    state.skipReason = `找不到 Playwright venv 解释器：${PYTHON_BIN}（先跑一次 webapp-testing skill 装好，或用 TASKFOLD_E2E_PYTHON 指定路径）`;
    return;
  }
  const gatewayUp = await probeGateway();
  if (!gatewayUp) {
    state.skipReason = `Gateway 探活失败：${GATEWAY_ORIGIN} 不可达（这套用例依赖本机运行中的 Gateway，CI 上没有，属于预期跳过）`;
    return;
  }
  const token = fetchGatewayToken();
  if (!token) {
    state.skipReason = "取不到 Gateway 令牌（openclaw CLI 不可用，或 auth-token --show 失败）";
    return;
  }

  try {
    state.projectCounts = fetchProjectCounts(token);
  } catch (error) {
    state.skipReason = `取不到项目列表基线计数（taskfold.projects.list 调用失败）：${String(error)}`;
    return;
  }

  state.available = true;
  state.facts = runRecon(token);
}, 120_000);

describe("Taskfold Control UI 基线（第 1 期，UI 连 SQLite；断言要对得住第 3 期切文件后端）", () => {
  it("登录与巡检脚本本身跑通，没有 fatalError", (ctx) => {
    if (!state.available) return ctx.skip();
    expect(state.facts?.fatalError).toBeUndefined();
    expect(state.facts?.loginOk).toBe(true);
    // 各小节允许独立失败并在 sectionErrors 里报告，但正常情况下应该是空的；
    // 非空时把内容打到失败信息里，方便直接定位是哪一节、哪一步炸的。
    expect(state.facts?.sectionErrors, JSON.stringify(state.facts?.sectionErrors)).toEqual({});
  });

  it("项目总数徽标：不受「包含已归档」勾选影响，且等于 Gateway 实时项目总数", (ctx) => {
    if (!state.available) return ctx.skip();
    const badge = state.facts?.projectBadgeTotal;
    expect(badge?.before).toBe(state.projectCounts?.total);
    expect(badge?.after).toBe(state.projectCounts?.total);
  });

  it("归档过滤：未勾选只显示未归档项目，勾选后包含已归档项目（fb-probe 现身）", (ctx) => {
    if (!state.available) return ctx.skip();
    const cards = state.facts?.projectCardCountVisible;
    expect(cards?.before).toBe(state.projectCounts?.active);
    expect(cards?.after).toBe(state.projectCounts?.total);

    const sidebar = state.facts?.sidebarProjectCounts;
    expect(sidebar?.before["fb-probe"]).toBeUndefined();
    expect(sidebar?.after["fb-probe"]).toBeDefined();

    // 复原动作本身要干净：脚本切完记得把勾选框改回去。
    expect(state.facts?.archiveToggleRestored).toBe(true);
  });

  it("三个项目的卡片数：ProCloud 81 / Taskfold 20 / default 0", (ctx) => {
    if (!state.available) return ctx.skip();
    const sidebar = state.facts?.sidebarProjectCounts?.before;
    expect(sidebar?.ProCloud).toBe(81);
    expect(sidebar?.Taskfold).toBe(20);
    expect(sidebar?.default).toBe(0);
  });

  it("看板状态列：固定 9 列，且列名与卡片数与基线一致", (ctx) => {
    if (!state.available) return ctx.skip();
    const columns = state.facts?.statusColumns ?? [];
    expect(columns.map((c) => c.name)).toEqual([
      "Triage", "待办池", "待办", "已计划", "就绪", "运行中", "查看", "已阻挡", "已完成",
    ]);
    const byName = Object.fromEntries(columns.map((c) => [c.name, c.cardCount]));
    expect(byName["待办"]).toBe(15);
    expect(byName["已完成"]).toBe(5);
    for (const name of ["Triage", "待办池", "已计划", "就绪", "运行中", "查看", "已阻挡"]) {
      expect(byName[name]).toBe(0);
    }
  });

  it("里程碑：8 个（M1-M4、M6-M9，无 M5）+ 未归属桶，不假设编号连续", (ctx) => {
    if (!state.available) return ctx.skip();
    const milestones = state.facts?.milestoneColumns ?? [];
    // "未归属"是里程碑分列视图下的桶，不是状态列——这里连同它一起断言，
    // 但不把它算进"8 个里程碑"里。
    expect(milestones).toContain("未归属");
    const namedMilestones = milestones.filter((m) => m !== "未归属");
    expect(namedMilestones).toEqual(["M1", "M2", "M3", "M4", "M6", "M7", "M8", "M9"]);
    expect(namedMilestones).not.toContain("M5");
    expect(namedMilestones).toHaveLength(8);
  });

  it("语言切换：简体中文 / 英语两个选项，且切换可来回", (ctx) => {
    if (!state.available) return ctx.skip();
    const options = state.facts?.languageOptions ?? [];
    expect(options).toEqual([
      ["zh-CN", "简体中文 (简体中文)"],
      ["en", "英语"],
    ]);
    expect(state.facts?.languageSwitchRoundTrip).toEqual({ switchedTo: "en", restoredTo: "zh-CN" });
  });

  it("卡片详情弹窗：16 类字段/区块完整显示，负责人字段正确回填「未归属」", (ctx) => {
    if (!state.available) return ctx.skip();
    const detail = state.facts?.cardDetail;
    expect(detail, "卡片详情弹窗抓取失败").toBeDefined();
    // 逐条报告缺失的标记，而不是只看 allMarkersFound 这一个布尔值，方便
    // 迁移后一旦某个区块渲染不出来能立刻定位是哪一类。
    const missing = Object.entries(detail?.foundMarkers ?? {})
      .filter(([, found]) => !found)
      .map(([marker]) => marker);
    expect(missing, `缺失的字段/区块标记：${missing.join(", ")}`).toEqual([]);

    // 字段映射层的通用兜底：不该出现 Invalid Date / NaN / undefined /
    // [object Object] 这类"字段没映射对"的渲染垃圾。created_date 本身
    // 在这个弹窗里没有直接展示的文本字段（见 control-ui-recon.py 头部
    // 注释），这条断言是唯一能覆盖到"日期/数组字段映射错了会露馅"的兜底。
    expect(detail?.brokenValuePatternsFound).toEqual([]);

    // assignee[] 为空数组时应该正确回填显示为"未归属"，而不是空白/报错。
    expect(detail?.assigneeFieldValue).toBe("未归属");
  });

  it("控制台没有超出允许名单的异常报错（允许名单内的已知无关 404 不强制要求出现）", (ctx) => {
    if (!state.available) return ctx.skip();
    // 允许名单语义：出现了不算错，不要求必须出现——这里只断言"控制台里没有
    // 允许名单以外的错误"，不断言这些已知无关 404 本身一定会发生。
    // 注意：`/plugins/taskfold/`（旧 iframe 静态路由）已不在名单里——`8cd934c`
    // 把这条路由连同 src/ui-static.ts 一起删掉了（原生注入取代旧管线），
    // Control UI 壳层不会再请求这个路径，这类 404 已经不可能再出现。
    const knownBenignUrlPatterns = [/\/api\/users\/[^/]+\/avatar\b/];

    const network = state.facts?.network4xx5xx ?? [];
    for (const entry of network) {
      expect(entry.status).toBe(404);
      expect(
        knownBenignUrlPatterns.some((pattern) => pattern.test(entry.url)),
        `出现未知的 4xx/5xx 请求，可能是迁移引入的新问题：${entry.status} ${entry.url}`,
      ).toBe(true);
    }

    const consoleErrors = state.facts?.consoleErrors ?? [];
    for (const entry of consoleErrors) {
      expect(entry.text).toContain("404");
    }
  });

  it("刷新机制：是一条常开 WebSocket，不是 HTTP 长轮询", (ctx) => {
    if (!state.available) return ctx.skip();
    const wsUrls = state.facts?.websocketUrls ?? [];
    expect(wsUrls.some((url) => url.startsWith("ws://127.0.0.1:18789/"))).toBe(true);
  });

  it("环境未残留副作用：分列方式/排序方式/排序方向/语言全部复原成原值", (ctx) => {
    if (!state.available) return ctx.skip();
    const restored = state.facts?.viewPrefsRestored;
    expect(
      restored?.matches,
      `视图偏好没有完全复原，原值：${JSON.stringify(restored?.original)}，` +
        `复原后：${JSON.stringify(restored?.final)}；这会让接下来打开 Taskfold 看板` +
        `的任何人（包括真实用户）看到跟基线不一致的默认视图，需要人工介入复原。`,
    ).toBe(true);
  });

  // ------------------------------------------------------------------
  // 占位用例：外部写入感知（第 3 期切文件后端后再启用）
  // ------------------------------------------------------------------
  //
  // 规划原文（需求/16-文件存储改造.md 10.2）写的是"用 backlog task edit
  // 改一张卡后 UI 自动刷新"，但用户已经决策放弃 CLI 互操作（见
  // requirement-doc-forks-parallel 等记忆），场景改成"直接改 .md 文件后
  // UI 自动刷新"。
  //
  // 第 1 期 Control UI 读写的仍是 SQLite（本文件其它用例验证的也是这一
  // 份数据），直接改一份 .md 文件根本不在这套后端的读取路径上，UI 不会
  // 也不应该刷新——这条用例现在测的话，"预期值"本身就是错的，所以显式
  // skip，不是"暂时跳过忘了写"，也不是悄悄删掉不提。
  //
  // 启用条件：第 3 期把 Control UI 的读写路径切到文件存储之后，把下面的
  // `it.skip` 换成 `it`，加上"用文件系统 API 改一张卡片对应的 .md 文件
  // -> 等常开 WebSocket 推送 -> 断言看板上的卡片文本/字段跟着变"的实现。
  it.skip("[第 3 期启用] 直接改卡片对应的 .md 文件后，看板通过常开 WebSocket 自动刷新", () => {
    throw new Error("占位用例：第 1 期 UI 仍连 SQLite，文件写入不在读取路径上，无法验证");
  });
});
