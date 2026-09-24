// ============================================================================
// Backlog.md 格式兼容契约测试（规划第十二节 · 降级版）
// ============================================================================
//
// 背景：Taskfold 已决策放弃与 backlog CLI 的运行时互操作——卡片放在 `.taskfold/cards/`，
// backlog 扫不到那个目录（2026-09-18 决策）。规划第十二节原本要求的回归测试
// 「① backlog CLI 编辑一次后 TASKFOLD 正文区块原样存活」现在没法按原意验（backlog
// 根本扫不到 Taskfold 真实存放卡片的目录），于是降级成一份**格式兼容契约测试**：
// 证明"如果将来真要把卡片挪进 backlog 管的 tasks/ 目录，Taskfold 当前的序列化格式
// 确实经得住 backlog CLI 的编辑"，而不只是源码注释里的一句口头承诺。
//
// 做法：用 Taskfold 真实的 serializeMarkdownCard() 生成卡片文件 → 放进一个手搭的
// 临时 backlog 项目 → 真的跑 `backlog` CLI 编辑它 → 用 Taskfold 真实的
// parseMarkdownCard() / findSectionFamilyBlock() 断言 TASKFOLD 区块与其它字段存活。
//
// 依赖：本机全局可用的 `backlog` CLI（本次验证用的是 Backlog.md v1.52.0）。源码
// 参考仓库 /home/john/src/lz/Backlog.md 是只读的，本文件从不 import 或修改那个仓库，
// 只是通过子进程调用全局安装的 `backlog` 二进制。
//
// 启用条件：`backlog --version` 能成功执行；探测失败时用 describe.skipIf 优雅跳过
// 整个 describe block，不让测试变红（CI 环境大概率没有这个二进制）。
//
// 稳定性注意事项：
// - `USE_GLOBAL_TASK_ID_LOCK=false` 让 backlog 跳过所有文件锁（proper-lockfile 用
//   mkdir 建空目录当锁，位置是 `<backlogDir>/.locks/...`），避免测试之间因为锁残留
//   互相干扰，也避免在临时目录里留下这些锁目录。
// - 每个用例都在 `os.tmpdir()` 下 `mkdtemp` 出独立的临时 backlog 项目，`afterEach`
//   统一 `rmSync` 清理，绝不碰 Taskfold 项目仓库本身。
// - config.yml 手写而不跑 `backlog init`（init 在无 TTY 环境下可能卡在交互问答上）。
//   `statuses` 配齐 Taskfold 的 9 个值，否则 `-s running/blocked/...` 会被 backlog
//   内部的 requireCanonicalStatus() 拒绝；`task_prefix: "card"` 与 Taskfold 的
//   前缀保持一致；`filesystem_only: true` 关闭 git 相关逻辑，临时项目不需要是 git 仓库。
// ============================================================================

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { TaskfoldCard } from "@taskfold/core/contract/index.js";
import { splitCardRuntime } from "@taskfold/core/file-store-card-runtime.js";
import {
  buildCardFilename,
  findSectionFamilyBlock,
  parseMarkdownCard,
  serializeMarkdownCard,
  splitFrontmatter,
  type CardDisplayId,
  type MarkdownCardDocument,
} from "@taskfold/core/markdown-card-format.js";

/** 探测 `backlog` CLI 是否在本机可用；探测失败时整份契约测试优雅跳过。 */
function detectBacklogAvailable(): boolean {
  try {
    execFileSync("backlog", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const HAS_BACKLOG = detectBacklogAvailable();

/** Taskfold 的 9 个状态值——config.yml 的 statuses 必须配齐，否则 `-s` 会被拒绝。 */
const TASKFOLD_STATUS_LIST = [
  "triage",
  "backlog",
  "todo",
  "scheduled",
  "ready",
  "running",
  "review",
  "blocked",
  "done",
];

/** Taskfold 的 4 个优先级值——同样要配齐，否则 `--priority` 会被 backlog 拒绝。 */
const TASKFOLD_PRIORITY_LIST = ["low", "normal", "high", "urgent"];

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/** 手搭一个最小可用的临时 backlog 项目（不跑 `backlog init`，避免交互式问答）。 */
function createBacklogProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-backlog-contract-"));
  roots.push(root);
  fs.mkdirSync(path.join(root, "backlog", "tasks"), { recursive: true });
  const configYaml = [
    'project_name: "Taskfold Contract Test"',
    `statuses: [${TASKFOLD_STATUS_LIST.map((s) => `"${s}"`).join(", ")}]`,
    "labels: []",
    // Taskfold 的 4 个优先级值也要配齐，否则 `--priority urgent` 会被
    // normalizePriority() 拒绝（backlog 默认值域只有 High/Medium/Low）。
    `priorities: [${TASKFOLD_PRIORITY_LIST.map((p) => `"${p}"`).join(", ")}]`,
    "date_format: yyyy-mm-dd hh:mm",
    'task_prefix: "card"',
    "filesystem_only: true",
    "remote_operations: false",
    "auto_commit: false",
    "bypass_git_hooks: true",
    "check_active_branches: false",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(root, "backlog", "config.yml"), configYaml, "utf8");
  return root;
}

/** 跑一次真实的 `backlog` CLI 子命令；跳过所有文件锁，保证临时目录干净、测试稳定。 */
function runBacklog(cwd: string, args: string[]): string {
  return execFileSync("backlog", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, USE_GLOBAL_TASK_ID_LOCK: "false" },
  });
}

function baseCard(overrides: Partial<TaskfoldCard> = {}): TaskfoldCard {
  return {
    id: "3f2a8b1c-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
    title: "契约测试卡片",
    status: "running",
    priority: "high",
    labels: ["bug", "urgent"],
    position: 1024.5,
    createdAt: Date.UTC(2026, 8, 18, 10, 23),
    updatedAt: Date.UTC(2026, 8, 18, 11, 4),
    revision: 3,
    agentId: "agent-1",
    notes: "Taskfold 独有字段：backlog 不认识这个键，编辑后必须原样保留",
    ...overrides,
  };
}

/** 用 Taskfold 真实的 serializeMarkdownCard() 生成一张卡片文件，写进临时 backlog 项目。
 * 与文件后端的写路径一致：先用 splitCardRuntime() 拆掉运行态字段与 revision（需求/18 §3.7，
 * 它们放在 gitignore 的 `.runtime/` 里，不进卡片 md）。 */
function writeTaskfoldCard(
  root: string,
  numericId: number,
  overrides: { card?: Partial<TaskfoldCard>; descriptionBody?: string; trailing?: string } = {},
): { filePath: string; markdown: string; displayId: CardDisplayId; card: TaskfoldCard } {
  const displayId: CardDisplayId = { prefix: "CARD", numericId };
  const card = baseCard(overrides.card);
  const doc: MarkdownCardDocument = {
    card: splitCardRuntime(card).mdCard,
    displayId,
    backlogOnly: {},
    descriptionBody: overrides.descriptionBody ?? "Taskfold 写的描述正文。",
    trailing: overrides.trailing ?? "",
  };
  const markdown = serializeMarkdownCard(doc);
  const filePath = path.join(root, "backlog", "tasks", buildCardFilename(displayId, card.title));
  fs.writeFileSync(filePath, markdown, "utf8");
  return { filePath, markdown, displayId, card };
}

/** TASKFOLD 区块里的 JSON。revision 已移到运行态文件，契约改为断言它不在 md 里。 */
function extractTaskfoldPayload(markdown: string): Record<string, unknown> {
  const lines = markdown.split("\n");
  const block = findSectionFamilyBlock(lines, "Taskfold", "TASKFOLD");
  if (!block) {
    throw new Error("测试断言失败：这份 markdown 里找不到 TASKFOLD 区块");
  }
  return JSON.parse(lines.slice(block.beginLineIndex + 1, block.endLineIndex).join("\n")) as Record<string, unknown>;
}

/** 提取 markdown 里的 TASKFOLD 区块原始文本（含 BEGIN/END 两行），不关心它在文件中的位置。 */
function extractTaskfoldBlockText(markdown: string): string {
  const lines = markdown.split("\n");
  const block = findSectionFamilyBlock(lines, "Taskfold", "TASKFOLD");
  if (!block) {
    throw new Error("测试断言失败：这份 markdown 里找不到 TASKFOLD 区块");
  }
  return lines.slice(block.beginLineIndex, block.endLineIndex + 1).join("\n");
}

describe.skipIf(!HAS_BACKLOG)("Backlog.md 格式兼容契约（真实跑 backlog CLI）", () => {
  it("场景 1：只改 frontmatter（-s 改状态）时，正文逐字不变，TASKFOLD 区块完整存活", () => {
    const root = createBacklogProject();
    const { filePath, markdown } = writeTaskfoldCard(root, 1);
    const originalBody = splitFrontmatter(markdown).body;
    const originalTaskfoldBlock = extractTaskfoldBlockText(markdown);

    runBacklog(root, ["task", "edit", "1", "-s", "blocked"]);

    const edited = fs.readFileSync(filePath, "utf8");
    expect(edited).toMatch(/^status: blocked$/m);
    // 正文一个字节都不该动——这是格式契约里记录的"好消息"：只改 frontmatter 不触发正文重建。
    expect(splitFrontmatter(edited).body).toBe(originalBody);
    expect(extractTaskfoldBlockText(edited)).toBe(originalTaskfoldBlock);

    const parsed = parseMarkdownCard(edited);
    expect(parsed.card.status).toBe("blocked");
    expect(parsed.card.id).toBe(baseCard().id);
    expect(extractTaskfoldPayload(edited)).not.toHaveProperty("revision");
    expect(parsed.card.notes).toBe(baseCard().notes);
  });

  it("场景 2：--notes 触发正文重建时，TASKFOLD 区块内容仍逐字存活（位置可能被重排，只断言内容）", () => {
    const root = createBacklogProject();
    const { filePath, markdown, card } = writeTaskfoldCard(root, 2);
    const originalTaskfoldBlock = extractTaskfoldBlockText(markdown);

    runBacklog(root, ["task", "edit", "2", "--notes", "backlog 写的实现笔记"]);

    const edited = fs.readFileSync(filePath, "utf8");
    // 先确认真的触发了正文重建（不是场景 1 的"纯 frontmatter"分支）。
    expect(edited).toContain("backlog 写的实现笔记");
    expect(edited).toContain("## Implementation Notes");
    // TASKFOLD 区块内容逐字不变——不断言它还在原来的行号上。
    expect(extractTaskfoldBlockText(edited)).toBe(originalTaskfoldBlock);

    // 往返：parseMarkdownCard 仍能正确解析，Taskfold 独有字段值不变。
    const parsed = parseMarkdownCard(edited);
    expect(parsed.card.id).toBe(card.id);
    expect(extractTaskfoldPayload(edited)).not.toHaveProperty("revision");
    expect(parsed.card.notes).toBe(card.notes);
    expect(parsed.card.position).toBe(card.position);
    expect(parsed.card.agentId).toBe(card.agentId);
  });

  it("场景 3a（对照）：没有 Description 哨兵的卡片，backlog 编辑后确实会把后面内容整段吞掉", () => {
    const root = createBacklogProject();
    const filePath = path.join(root, "backlog", "tasks", "card-3 - 对照卡片.md");
    const controlMarker = "CONTROL-MARKER-理应消失";
    fs.writeFileSync(
      filePath,
      [
        "---",
        "id: CARD-3",
        "title: 对照卡片",
        "status: todo",
        "assignee: []",
        "created_date: '2026-09-18 00:00'",
        "labels: []",
        "dependencies: []",
        "priority: normal",
        "ordinal: 1",
        "---",
        "",
        "## Description", // 故意不带 SECTION:DESCRIPTION:BEGIN/END 哨兵——这是 P0 雷 #2 的诱因
        "Legacy description body",
        "",
        "## Taskfold",
        "",
        "<!-- SECTION:TASKFOLD:BEGIN -->",
        `{"uuid":"control-card","revision":1,"position":1,"marker":"${controlMarker}"}`,
        "<!-- SECTION:TASKFOLD:END -->",
        "",
        "## Random Notes",
        controlMarker,
        "",
      ].join("\n"),
      "utf8",
    );

    runBacklog(root, ["task", "edit", "3", "-d", "New description"]);

    const edited = fs.readFileSync(filePath, "utf8");
    // legacy 无哨兵的 "## Description" 吞掉了后面直到文末的一切，包括 TASKFOLD 区块本身。
    expect(edited).not.toContain(controlMarker);
    expect(edited).not.toContain("SECTION:TASKFOLD");
    expect(edited).not.toContain("## Random Notes");
  });

  it("场景 3b：Taskfold 给 Description 加满哨兵后，同样的编辑不再吞掉后面内容——证明防护必要且有效", () => {
    const root = createBacklogProject();
    const controlMarker = "PROTECTED-MARKER-理应存活";
    const { filePath, markdown } = writeTaskfoldCard(root, 4, {
      trailing: `## Random Notes\n${controlMarker}`,
    });
    const originalTaskfoldBlock = extractTaskfoldBlockText(markdown);
    // 先确认这份"受保护"卡片和场景 3a 的对照卡片结构上是可比的：都有 Description 正文、
    // 一个 TASKFOLD 区块、一段 Random Notes——唯一区别是 Description 是否带完整哨兵。
    expect(markdown).toContain("<!-- SECTION:DESCRIPTION:BEGIN -->");
    expect(markdown).toContain("<!-- SECTION:DESCRIPTION:END -->");

    runBacklog(root, ["task", "edit", "4", "-d", "New description"]);

    const edited = fs.readFileSync(filePath, "utf8");
    // 关键对照结果：同一种编辑操作，这次 Random Notes 和 TASKFOLD 区块都活下来了。
    expect(edited).toContain(controlMarker);
    expect(edited).toContain("## Random Notes");
    expect(extractTaskfoldBlockText(edited)).toBe(originalTaskfoldBlock);

    const parsed = parseMarkdownCard(edited);
    expect(parsed.descriptionBody).toBe("New description");
    expect(parsed.trailing).toBe(`## Random Notes\n${controlMarker}`);
    expect(parsed.card.id).toBe(baseCard().id);
    expect(extractTaskfoldPayload(edited)).not.toHaveProperty("revision");
  });

  it("往返：backlog 连续编辑多次后，parseMarkdownCard 仍正确解析，frontmatter 改动与 Taskfold 独有字段各自保持正确", () => {
    const root = createBacklogProject();
    const { filePath, card } = writeTaskfoldCard(root, 5, {
      trailing: "## Random Notes\n需要活下来的旁注",
    });

    // 先只改 frontmatter，再触发一次正文重建——模拟真实使用中两类编辑交替发生。
    runBacklog(root, ["task", "edit", "5", "-s", "review", "--priority", "urgent"]);
    runBacklog(root, ["task", "edit", "5", "--plan", "backlog 写的实现计划"]);

    const edited = fs.readFileSync(filePath, "utf8");
    const parsed = parseMarkdownCard(edited);

    // backlog 改动的字段：确实生效。
    expect(parsed.card.status).toBe("review");
    expect(parsed.card.priority).toBe("urgent");
    expect(edited).toContain("backlog 写的实现计划");

    // Taskfold 独有字段：backlog 完全不认识 TASKFOLD 区块内部的 JSON，值必须原样不变。
    expect(parsed.card.id).toBe(card.id);
    expect(extractTaskfoldPayload(edited)).not.toHaveProperty("revision");
    expect(parsed.card.notes).toBe(card.notes);
    expect(parsed.card.position).toBe(card.position);
    expect(parsed.card.agentId).toBe(card.agentId);
    expect(parsed.card.labels).toEqual(card.labels);

    // 未被两次编辑触及的旁注内容也应该还在（哪怕位置已经被重排）。
    expect(parsed.trailing).toContain("需要活下来的旁注");
  });
});
