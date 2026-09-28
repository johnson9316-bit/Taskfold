// TASK-5 AC#1：`taskfold` CLI 的 `--json` 输出与错误码契约（需求/18 §4）。
//
// 全部用真实子进程跑构建出来的 bundle（test/helpers/cli-harness.ts），在临时 git 仓库上操作：
//   - 每个 kind 的 JSON 形状（键集合精确匹配，缺省值用 null/[]/false，不省略键）；
//   - 每个错误码：退出码、stdout 为空、stderr 恰好一行 `{schemaVersion, kind: "error", error}`；
//   - stdout 不是 TTY 时纯文本、无 ANSI 控制符；每个命令的 --help 带读写对象与示例。
// LOCKED 与「LOCKED 不被误报成 CONFLICT」在 test/cli-locking.test.ts（要另一个进程真实持锁）。
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TASKFOLD_CLI_EXIT_CODES, type TaskfoldCliErrorCode } from "@taskfold/cli/errors.js";
import { TASKFOLD_CLI_SCHEMA_VERSION } from "@taskfold/cli/version.js";
import {
  buildCliBundle,
  cleanupTempDirs,
  makeTempDir,
  makeTempGitRepo,
  runCliProcess,
  runJson,
} from "./helpers/cli-harness.js";

const CARD_SUMMARY_KEYS = [
  "agentId",
  "archived",
  "boardId",
  "createdAt",
  "displayId",
  "id",
  "labels",
  "milestoneId",
  "priority",
  "revision",
  "shortId",
  "status",
  "title",
  "updatedAt",
];
const CARD_DETAIL_KEYS = [...CARD_SUMMARY_KEYS, "notes"].toSorted();

const COMMANDS = ["init", "list", "show", "create", "update", "delete", "boards", "instructions", "guidelines"];

let bundle: string;

beforeAll(() => {
  bundle = buildCliBundle();
}, 60_000);

afterAll(() => {
  cleanupTempDirs();
});

function keys(value: unknown): string[] {
  return Object.keys(value as object).toSorted();
}

function expectCardDetail(card: Record<string, unknown>): void {
  expect(keys(card)).toEqual(CARD_DETAIL_KEYS);
  expect(card.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(card.shortId).toBe((card.id as string).slice(0, 8));
  expect(card.displayId).toMatch(/^card-\d+$/);
  expect(typeof card.revision).toBe("number");
  expect(Number.isNaN(Date.parse(card.createdAt as string))).toBe(false);
  expect(typeof card.notes).toBe("string");
}

async function initializedRepo(): Promise<string> {
  const repo = makeTempGitRepo();
  await runJson(bundle, ["init"], { cwd: repo });
  return repo;
}

async function expectError(
  args: readonly string[],
  cwd: string,
  code: TaskfoldCliErrorCode,
  input?: string,
): Promise<Record<string, any>> {
  const result = await runCliProcess(bundle, args, { cwd, input });
  expect(result.code).toBe(TASKFOLD_CLI_EXIT_CODES[code]);
  expect(result.code).not.toBe(0);
  expect(result.stdout).toBe("");
  const lines = result.stderr.trimEnd().split("\n");
  expect(lines).toHaveLength(1);
  const payload = JSON.parse(lines[0]!) as Record<string, any>;
  expect(keys(payload)).toEqual(["error", "kind", "schemaVersion"]);
  expect(payload.schemaVersion).toBe(TASKFOLD_CLI_SCHEMA_VERSION);
  expect(payload.kind).toBe("error");
  expect(keys(payload.error).filter((key) => key !== "details")).toEqual(["code", "message"]);
  expect(payload.error.code).toBe(code);
  expect(typeof payload.error.message).toBe("string");
  expect(payload.error.message.length).toBeGreaterThan(0);
  return payload.error;
}

describe("taskfold --json：每个 kind 的形状", () => {
  it("init：建出 config.yml（带 format_version）与 .gitignore，重跑幂等", async () => {
    const repo = makeTempGitRepo();
    const first = await runJson(bundle, ["init"], { cwd: repo });
    expect(keys(first)).toEqual(["created", "dataDir", "formatVersion", "kind", "schemaVersion"]);
    expect(first).toMatchObject({ schemaVersion: 1, kind: "init", created: true, formatVersion: 2 });
    expect(first.dataDir).toBe(path.join(repo, ".taskfold"));
    expect(fs.readFileSync(path.join(repo, ".taskfold", "config.yml"), "utf8")).toMatch(/^format_version: 2$/m);
    expect(fs.readFileSync(path.join(repo, ".taskfold", ".gitignore"), "utf8")).toContain(".runtime/");
    expect(fs.statSync(path.join(repo, ".taskfold", "cards")).isDirectory()).toBe(true);

    const again = await runJson(bundle, ["init"], { cwd: path.join(repo) });
    expect(again).toMatchObject({ kind: "init", created: false });
  });

  it("card（create / show / update）、card-list、card-deleted", async () => {
    const repo = await initializedRepo();
    const created = await runJson(bundle, ["create", "Write", "release", "notes", "--labels", "docs,release"], {
      cwd: repo,
    });
    expect(keys(created)).toEqual(["card", "kind", "schemaVersion"]);
    expect(created.kind).toBe("card");
    expectCardDetail(created.card);
    expect(created.card).toMatchObject({
      title: "Write release notes",
      status: "todo",
      priority: "normal",
      labels: ["docs", "release"],
      agentId: null,
      boardId: "default",
      milestoneId: null,
      archived: false,
      revision: 1,
      notes: "",
    });

    const shown = await runJson(bundle, ["show", created.card.shortId], { cwd: repo });
    expect(keys(shown)).toEqual(["card", "kind", "schemaVersion"]);
    expect(shown.card).toEqual(created.card);
    expect((await runJson(bundle, ["show", created.card.id], { cwd: repo })).card.id).toBe(created.card.id);
    expect((await runJson(bundle, ["show", created.card.displayId], { cwd: repo })).card.id).toBe(created.card.id);

    const updated = await runJson(
      bundle,
      ["update", created.card.displayId, "--status", "running", "--append-notes", "first", "--add-label", "x"],
      { cwd: repo },
    );
    expect(updated.kind).toBe("card");
    expectCardDetail(updated.card);
    expect(updated.card).toMatchObject({ status: "running", notes: "first", labels: ["docs", "release", "x"] });
    expect(updated.card.revision).toBe(created.card.revision + 1);

    const listed = await runJson(bundle, ["list"], { cwd: repo });
    expect(keys(listed)).toEqual(["boardId", "cards", "kind", "schemaVersion"]);
    expect(listed).toMatchObject({ kind: "card-list", boardId: null });
    expect(listed.cards).toHaveLength(1);
    expect(keys(listed.cards[0])).toEqual(CARD_SUMMARY_KEYS.toSorted());

    const deleted = await runJson(bundle, ["delete", created.card.displayId], { cwd: repo });
    expect(deleted).toEqual({ schemaVersion: 1, kind: "card-deleted", id: created.card.id });
    expect((await runJson(bundle, ["list"], { cwd: repo })).cards).toEqual([]);
  });

  it("board-list", async () => {
    const repo = await initializedRepo();
    await runJson(bundle, ["create", "a"], { cwd: repo });
    const boards = await runJson(bundle, ["boards"], { cwd: repo });
    expect(keys(boards)).toEqual(["boards", "defaultBoardId", "kind", "schemaVersion"]);
    expect(boards).toMatchObject({ kind: "board-list", defaultBoardId: "default" });
    expect(boards.boards).toHaveLength(1);
    expect(keys(boards.boards[0])).toEqual(["active", "archived", "byStatus", "id", "total"]);
    expect(boards.boards[0]).toMatchObject({ id: "default", total: 1, active: 1, archived: 0, byStatus: { todo: 1 } });
  });

  it("instructions 与 guidelines", async () => {
    const repo = makeTempGitRepo();
    const instructions = await runJson(bundle, ["instructions"], { cwd: repo });
    expect(keys(instructions)).toEqual(["kind", "schemaVersion", "text", "version"]);
    expect(instructions.kind).toBe("instructions");
    expect(instructions.text).toContain(`v${instructions.version}`);

    const guidelines = await runJson(bundle, ["guidelines"], { cwd: repo });
    expect(keys(guidelines)).toEqual(["files", "kind", "schemaVersion", "version"]);
    expect(guidelines.kind).toBe("guidelines");
    expect(guidelines.version).toBe(instructions.version);
    expect(guidelines.files).toEqual([
      { path: path.join(repo, "AGENTS.md"), action: "created" },
      { path: path.join(repo, "CLAUDE.md"), action: "created" },
    ]);
  });
});

describe("taskfold 错误码：stderr 结构化 JSON + 非零退出码", () => {
  it("NOT_INITIALIZED：仓库里没有 .taskfold/", async () => {
    await expectError(["list"], makeTempGitRepo(), "NOT_INITIALIZED");
  });

  it("INVALID_ARGUMENT：未知选项、非法取值、没有要改的字段", async () => {
    const repo = await initializedRepo();
    const { card } = await runJson(bundle, ["create", "a"], { cwd: repo });
    await expectError(["list", "--bogus"], repo, "INVALID_ARGUMENT");
    await expectError(["update", card.id, "--status", "finished"], repo, "INVALID_ARGUMENT");
    await expectError(["update", card.id], repo, "INVALID_ARGUMENT");
    await expectError(["frobnicate"], repo, "INVALID_ARGUMENT");
  });

  it("REVISION_REQUIRED：整体替换正文不带 --expect-revision", async () => {
    const repo = await initializedRepo();
    const { card } = await runJson(bundle, ["create", "a"], { cwd: repo });
    await expectError(["update", card.id, "--notes", "whole new body"], repo, "REVISION_REQUIRED");
    await expectError(["update", card.id, "--notes-file", "-"], repo, "REVISION_REQUIRED", "from stdin");
    expect((await runJson(bundle, ["show", card.id], { cwd: repo })).card.notes).toBe("");
  });

  it("NOT_FOUND：id 不存在", async () => {
    const repo = await initializedRepo();
    const error = await expectError(["show", "deadbeef"], repo, "NOT_FOUND");
    expect(error.details).toEqual({ id: "deadbeef" });
    await expectError(["delete", "deadbeef"], repo, "NOT_FOUND");
  });

  it("AMBIGUOUS：卡片分属多个 board 而 create 没给 --board", async () => {
    const repo = await initializedRepo();
    await runJson(bundle, ["create", "a", "--board", "alpha"], { cwd: repo });
    await runJson(bundle, ["create", "b", "--board", "beta"], { cwd: repo });
    const error = await expectError(["create", "c"], repo, "AMBIGUOUS");
    expect(error.details).toEqual({ boards: ["alpha", "beta"] });
    expect((await runJson(bundle, ["boards"], { cwd: repo })).defaultBoardId).toBeNull();
  });

  it("CONFLICT：--expect-revision 已过期，写入被拒，卡片不变", async () => {
    const repo = await initializedRepo();
    const { card } = await runJson(bundle, ["create", "a", "--notes", "original"], { cwd: repo });
    // 另一个写入者先改了一次，revision 前进。
    await runJson(bundle, ["update", card.id, "--status", "running"], { cwd: repo });
    const error = await expectError(
      ["update", card.id, "--notes", "stale overwrite", "--expect-revision", String(card.revision)],
      repo,
      "CONFLICT",
    );
    expect(error.details).toEqual({
      id: card.id,
      expectedRevision: card.revision,
      reason: "revision",
      currentRevision: card.revision + 1,
    });
    expect((await runJson(bundle, ["show", card.id], { cwd: repo })).card.notes).toBe("original");
  });

  it("FORMAT_TOO_NEW：config.yml 的格式比 CLI 新时写入被拒，读照常", async () => {
    const repo = await initializedRepo();
    await runJson(bundle, ["create", "a"], { cwd: repo });
    fs.writeFileSync(path.join(repo, ".taskfold", "config.yml"), "format_version: 999\n");
    await expectError(["create", "b"], repo, "FORMAT_TOO_NEW");
    await expectError(["init"], repo, "FORMAT_TOO_NEW");
    expect((await runJson(bundle, ["list"], { cwd: repo })).cards).toHaveLength(1);
  });

  it("REJECTED：core 拒绝了操作（空标题）", async () => {
    const repo = await initializedRepo();
    const { card } = await runJson(bundle, ["create", "a"], { cwd: repo });
    const error = await expectError(["update", card.id, "--title", ""], repo, "REJECTED");
    expect(error.message).toBe("title is required.");
  });

  it("INTERNAL：意外的 I/O 错误（cards 目录变成了文件）", async () => {
    const repo = await initializedRepo();
    const cardsDir = path.join(repo, ".taskfold", "cards");
    fs.rmSync(cardsDir, { recursive: true });
    fs.writeFileSync(cardsDir, "");
    await expectError(["list"], repo, "INTERNAL");
  });
});

describe("taskfold 定位 .taskfold/", () => {
  it("在子目录里运行：往上找到仓库根的 .taskfold/", async () => {
    const repo = await initializedRepo();
    const sub = path.join(repo, "src", "deep");
    fs.mkdirSync(sub, { recursive: true });
    const { card } = await runJson(bundle, ["create", "from subdir"], { cwd: sub });
    expect((await runJson(bundle, ["show", card.id], { cwd: repo })).card.title).toBe("from subdir");
  });

  it("在 git worktree 里运行：init 与读写都落到主 checkout 的 .taskfold/，worktree 里不生成副本", async () => {
    const main = makeTempGitRepo();
    const git = (...args: string[]) =>
      execFileSync("git", ["-c", "user.email=t@example.com", "-c", "user.name=t", ...args], { cwd: main, stdio: "pipe" });
    git("commit", "--allow-empty", "-q", "-m", "init");
    const worktree = path.join(makeTempDir("taskfold-cli-wt-"), "wt");
    git("worktree", "add", "-q", worktree, "-b", "feature");
    fs.mkdirSync(path.join(worktree, "only-in-worktree"));

    const init = await runJson(bundle, ["init"], { cwd: worktree });
    expect(init.dataDir).toBe(path.join(main, ".taskfold"));
    const { card } = await runJson(bundle, ["create", "from worktree"], { cwd: path.join(worktree, "only-in-worktree") });
    expect(fs.existsSync(path.join(worktree, ".taskfold"))).toBe(false);
    expect((await runJson(bundle, ["show", card.id], { cwd: main })).card.title).toBe("from worktree");
  });
});

describe("taskfold 文本输出与帮助", () => {
  it("stdout 不是 TTY 时是纯文本，没有任何 ANSI 控制符", async () => {
    const repo = await initializedRepo();
    const created = await runCliProcess(bundle, ["create", "Plain", "text"], { cwd: repo });
    expect(created.code).toBe(0);
    const listed = await runCliProcess(bundle, ["list"], { cwd: repo });
    expect(listed.code).toBe(0);
    expect(listed.stdout).toMatch(/^card-\d+ {2}todo {6}normal {2}default {2}Plain text$/m);
    for (const output of [created.stdout, listed.stdout]) {
      expect(output).not.toMatch(/\u001b\[/);
    }
  });

  it("每个命令的 --help 都带参数说明、读写对象与示例，退出码 0", async () => {
    const cwd = makeTempDir("taskfold-cli-help-");
    const root = await runCliProcess(bundle, ["--help"], { cwd });
    expect(root.code).toBe(0);
    for (const command of COMMANDS) {
      expect(root.stdout).toContain(command);
    }
    expect(root.stdout).toContain("/mnt/c");
    for (const command of COMMANDS) {
      const help = await runCliProcess(bundle, [command, "--help"], { cwd });
      expect(help.code, command).toBe(0);
      expect(help.stdout, command).toMatch(/Options:/);
      expect(help.stdout, command).toMatch(/Reads\/writes:\n {2}Reads: {2}.+\n {2}Writes: .+/);
      expect(help.stdout, command).toMatch(/Examples:\n {2}\$ taskfold /);
    }
  });
});
