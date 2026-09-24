// TASK-10：`openclaw taskfold migrate-sqlite` —— SQLite 旧数据一次性迁到文件存储。
//
// 要点（逐条有用例）：
// - dry-run 在临时目录里完整写一遍、读回比对，给出各项目各实体计数；不在任何仓库里建 `.taskfold/`、
//   不写 projects.json、不做备份。
// - apply 先把 taskfold.sqlite（连同 -wal/-shm）复制到 backup/，只读打开一份快照来读；各项目先写
//   临时目录、全部校验通过再改名；最后写 projects.json 与迁移标记。
// - 绑了仓库的项目写进主 checkout 的 `.taskfold/`，没绑的写进 `<pluginDir>/projects/<id>/`，数据
//   一条不丢；零数据项目不建目录。
// - 迁移后卡片逐字段一致（含毫秒 createdAt、revision、claim/execution 运行态），各看板卡片顺序与
//   SQLite 后端逐张一致。
// - 目标已存在就拒绝执行；中途失败清掉本次建的所有东西，原状不动。
// - 不读也不写 flowboard/gsdboard/workboard 三份历史库（用例里把它们设成不可读，迁移照样成功）。
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { TaskfoldCard, TaskfoldMilestone, TaskfoldProjectDocument } from "@taskfold/core/contract/index.js";
import { createTaskfoldSqliteStores } from "../packages/openclaw/src/backend/src/sqlite-store.js";
import { createTaskfoldProjectRoutedStores } from "../packages/openclaw/src/backend/src/project-routed-stores.js";
import { runTaskfoldSqliteMigration } from "../packages/openclaw/src/backend/src/sqlite-migration.js";
import { TaskfoldStore } from "../packages/openclaw/src/backend/src/store.js";

const roots: string[] = [];
const chmodRestore: Array<{ target: string; mode: number }> = [];

afterEach(() => {
  for (const { target, mode } of chmodRestore.splice(0).reverse()) {
    fs.chmodSync(target, mode);
  }
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function chmodFor(target: string, mode: number): void {
  chmodRestore.push({ target, mode: fs.statSync(target).mode & 0o777 });
  fs.chmodSync(target, mode);
}

function gitRepo(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync("git", ["init", "-q", dir], { stdio: "pipe" });
  return fs.realpathSync(dir);
}

function sha256(file: string): string {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

const MINUTE = Date.UTC(2026, 6, 29, 2, 41);

function card(id: string, boardId: string, overrides: Partial<TaskfoldCard> = {}): TaskfoldCard {
  return {
    id,
    title: `卡 ${id}`,
    status: "done",
    priority: "normal",
    labels: [],
    position: 1000,
    createdAt: MINUTE + 42_225,
    updatedAt: MINUTE + 3_600_000 + 17,
    revision: 0,
    metadata: { automation: { boardId } },
    ...overrides,
  };
}

function milestone(id: string, boardId: string, position: number): TaskfoldMilestone {
  return {
    id,
    boardId,
    title: `里程碑 ${id}`,
    position,
    state: "active",
    createdAt: MINUTE + position,
    updatedAt: MINUTE + 90_123,
  };
}

function document(id: string, boardId: string, key: string, target?: string): TaskfoldProjectDocument {
  return {
    id,
    boardId,
    key,
    section: "project",
    source: "project",
    type: target ? "path" : "markdown",
    title: key,
    ...(target ? { target } : {}),
    position: 1000,
    system: true,
    createdAt: MINUTE + 5,
    updatedAt: MINUTE + 6,
  };
}

/** 一份仿真的 OpenClaw state 目录：SQLite 里有绑仓库的项目、没绑仓库的 default/归档项目、零数据项目。 */
async function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-sqlite-migration-")));
  roots.push(root);
  const stateDir = path.join(root, "state");
  const pluginDir = path.join(stateDir, "plugins", "taskfold");
  const sqlitePath = path.join(pluginDir, "taskfold.sqlite");
  const repo = gitRepo(path.join(root, "repo"));
  const emptyRepo = gitRepo(path.join(root, "empty-repo"));

  const legacy = ["flowboard", "gsdboard", "workboard"].map((name) => {
    const dir = path.join(stateDir, "plugins", name);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${name}.sqlite`);
    fs.writeFileSync(file, `sentinel ${name}`);
    return { dir, file };
  });

  const sqlite = createTaskfoldSqliteStores({ dbPath: sqlitePath });
  const boards = [
    { id: "proj", name: "有仓库", position: 1000, defaultWorkspace: { kind: "dir" as const, path: repo } },
    { id: "default", position: 3000 },
    { id: "probe", name: "归档探测", position: 4000, archivedAt: MINUTE + 1 },
    { id: "empty", name: "零数据", position: 5000, defaultWorkspace: { kind: "dir" as const, path: emptyRepo } },
  ];
  for (const board of boards) {
    await sqlite.boards.register(board.id, {
      version: 1,
      board: { ...board, createdAt: MINUTE, updatedAt: MINUTE + 1 },
    });
  }
  // proj：三张 status/position/createdAt 全相同的卡（顺序只能靠 id 决胜），外加字段最全的一张。
  const tied = ["c-b", "cb", "c-a"].map((id) => card(id, "proj"));
  const rich = card("rich", "proj", {
    title: "字段最全的卡",
    status: "todo",
    labels: ["x", "y"],
    notes: "正文\n第二行",
    revision: 12,
    milestoneId: "m-proj-2",
    startedAt: MINUTE + 11,
    completedAt: MINUTE + 12,
    sessionKey: "subagent:taskfold-proj-rich",
    runId: "taskfold:execution:rich:1",
    execution: {
      id: "rich:agent-session",
      kind: "agent-session",
      mode: "autonomous",
      status: "done",
      sessionKey: "subagent:taskfold-proj-rich",
      runId: "taskfold:execution:rich:1",
      startedAt: MINUTE + 11,
      updatedAt: MINUTE + 12,
    },
    delivery: { objective: "目标", updatedAt: MINUTE + 13 },
    sourceReferences: [{ id: "sr1", label: "spec", target: "/abs/spec.md", position: 1, createdAt: 1, updatedAt: 2 }],
    events: [
      { id: "e1", kind: "created", at: MINUTE + 1 },
      { id: "e2", kind: "moved", at: MINUTE + 2, fromStatus: "todo", toStatus: "running" },
    ],
    metadata: {
      automation: { boardId: "proj", workspace: { kind: "dir", path: repo } },
      archivedAt: MINUTE + 99,
      attempts: [{ id: "a1", status: "succeeded", startedAt: MINUTE + 3, endedAt: MINUTE + 4, mode: "autonomous" }],
      workerLogs: [{ id: "w1", createdAt: MINUTE + 5, level: "info", message: "log" }],
      comments: [{ id: "co1", body: "评论", createdAt: MINUTE + 6 }],
      links: [{ id: "l1", type: "relates_to", targetCardId: "c-a", createdAt: MINUTE + 7 }],
      attachments: [{ id: "att1", cardId: "rich", createdAt: MINUTE + 8, fileName: "a.txt", byteSize: 5 }],
    },
  });
  const inDefault = card("in-default", "default", { status: "todo", revision: 3 });
  for (const value of [...tied, rich, inDefault]) {
    await sqlite.cards.register(value.id, { version: 1, card: value });
  }
  await sqlite.attachments.register("att1", {
    version: 1,
    attachment: rich.metadata!.attachments![0]!,
    contentBase64: Buffer.from("hello").toString("base64"),
  });
  for (const value of [milestone("m-proj-1", "proj", 1000), milestone("m-proj-2", "proj", 2000), milestone("m-probe", "probe", 1000)]) {
    await sqlite.milestones.register(value.id, { version: 1, milestone: value });
  }
  for (const value of [
    document("d-proj", "proj", "file.readme", path.join(repo, "README.md")),
    document("d-default-1", "default", "architecture"),
    document("d-default-2", "default", "stack"),
  ]) {
    await sqlite.documents.register(value.id, { version: 1, document: value });
  }
  sqlite.close();

  for (const { dir, file } of legacy) {
    chmodFor(file, 0o000);
    chmodFor(dir, 0o000);
  }
  return { root, stateDir, pluginDir, sqlitePath, repo, emptyRepo, legacy };
}

function mdFiles(dir: string): string[] {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith(".md")) : [];
}

describe("migrate-sqlite --dry-run", () => {
  it("给出各项目各实体计数，与 SQLite 一致；任何仓库、插件目录都不写", async () => {
    const { pluginDir, repo, emptyRepo } = await fixture();
    const report = await runTaskfoldSqliteMigration({ pluginDir, mode: "dry-run" });

    const byId = Object.fromEntries(report.projects.map((project) => [project.boardId, project]));
    expect(byId.proj?.dataDir).toBe(path.join(repo, ".taskfold"));
    expect(byId.proj?.source).toMatchObject({ cards: 4, archivedCards: 1, milestones: 2, documents: 1, attachments: 1 });
    expect(byId.proj?.source).toMatchObject({ labels: 2, events: 2, links: 1, delivery: 1, sourceReferences: 1 });
    expect(byId.proj?.source).toMatchObject({ attempts: 1, workerLogs: 1, comments: 1 });
    expect(byId.default?.dataDir).toBe(path.join(pluginDir, "projects", "default"));
    expect(byId.default?.source).toMatchObject({ cards: 1, documents: 2 });
    expect(byId.probe?.source).toMatchObject({ milestones: 1 });
    expect(byId.empty?.skipped).toBe(true);
    for (const project of report.projects.filter((p) => !p.skipped)) {
      expect(project.written).toEqual(project.source);
    }
    expect(report.boards).toBe(4);
    expect(report.blockers).toEqual([]);
    expect(report.applied).toBe(false);

    expect(fs.existsSync(path.join(repo, ".taskfold"))).toBe(false);
    expect(fs.existsSync(path.join(emptyRepo, ".taskfold"))).toBe(false);
    expect(fs.readdirSync(repo).filter((name) => name.startsWith(".taskfold"))).toEqual([]);
    expect(fs.readdirSync(pluginDir).filter((name) => !name.startsWith("taskfold.sqlite"))).toEqual([]);
  });
});

describe("migrate-sqlite --apply", () => {
  it("备份、写入各项目数据根、写 projects.json；卡片逐字段一致、看板顺序逐张一致", async () => {
    const { pluginDir, sqlitePath, repo, emptyRepo, legacy } = await fixture();
    const sqliteHash = sha256(sqlitePath);
    const legacyStats = legacy.map(({ dir }) => fs.statSync(dir).mtimeMs);

    const report = await runTaskfoldSqliteMigration({ pluginDir, mode: "apply" });
    expect(report.applied).toBe(true);

    // 备份：taskfold.sqlite 原样复制到 backup/；原库一个字节都没动。
    expect(report.backupFiles.length).toBeGreaterThan(0);
    const backupDb = report.backupFiles.find((file) => file.endsWith(".sqlite"))!;
    expect(path.dirname(backupDb)).toBe(path.join(pluginDir, "backup"));
    expect(sha256(backupDb)).toBe(sqliteHash);
    expect(sha256(sqlitePath)).toBe(sqliteHash);
    expect(legacy.map(({ dir }) => fs.statSync(dir).mtimeMs)).toEqual(legacyStats);

    // 落点：绑仓库的进主 checkout；没绑的进插件目录；零数据项目不建目录；不留临时目录。
    expect(mdFiles(path.join(repo, ".taskfold", "cards"))).toHaveLength(4);
    expect(mdFiles(path.join(repo, ".taskfold", "milestones"))).toHaveLength(2);
    expect(mdFiles(path.join(pluginDir, "projects", "default", "cards"))).toHaveLength(1);
    expect(fs.readdirSync(path.join(pluginDir, "projects", "default", "documents"))).toHaveLength(2);
    expect(mdFiles(path.join(pluginDir, "projects", "probe", "milestones"))).toHaveLength(1);
    expect(fs.existsSync(path.join(emptyRepo, ".taskfold"))).toBe(false);
    expect(fs.readdirSync(repo).filter((name) => name.startsWith(".taskfold"))).toEqual([".taskfold"]);
    expect(fs.readdirSync(path.join(pluginDir, "projects")).toSorted()).toEqual(["default", "probe"]);
    expect(Object.keys(JSON.parse(fs.readFileSync(path.join(pluginDir, "projects.json"), "utf8"))).toSorted()).toEqual(
      ["default", "empty", "probe", "proj"],
    );

    // 逐字段一致：SQLite 后端与文件后端各开一个 TaskfoldStore，读到的东西相同。
    const before = TaskfoldStore.fromStores(createTaskfoldSqliteStores({ dbPath: backupDb }));
    const after = TaskfoldStore.fromStores(createTaskfoldProjectRoutedStores({ pluginDir }));
    for (const boardId of ["proj", "default", "probe", "empty"]) {
      const expected = await before.list({ boardId });
      const actual = await after.list({ boardId });
      expect(actual.map((c) => c.id)).toEqual(expected.map((c) => c.id));
      expect(actual).toEqual(expected);
      const milestonesBefore = (await before.listMilestones(boardId)).milestones;
      const milestonesAfter = (await after.listMilestones(boardId)).milestones;
      expect(milestonesAfter.map((m) => m.id)).toEqual(milestonesBefore.map((m) => m.id));
      expect(milestonesAfter.map((m) => ({ ...m, updatedAt: 0 }))).toEqual(milestonesBefore.map((m) => ({ ...m, updatedAt: 0 })));
    }
    expect((await after.list({ boardId: "proj" })).filter((c) => c.status === "done").map((c) => c.id)).toEqual([
      "c-a",
      "c-b",
      "cb",
    ]);
    expect((await after.listProjects({ includeArchived: true })).projects.map((p) => p.id)).toEqual(
      (await before.listProjects({ includeArchived: true })).projects.map((p) => p.id),
    );
    expect(await after.getAttachment("att1")).toEqual(await before.getAttachment("att1"));
    // listProjectDocuments 会顺手做一次文档发现，这里直接比存储里的记录。
    const documentsOf = async (store: TaskfoldStore) =>
      (await (store as unknown as { documentStore: { entries(): Promise<Array<{ key: string; value: unknown }>> } })
        .documentStore.entries())
        .map((entry) => entry.value)
        .toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    expect(await documentsOf(after)).toEqual(await documentsOf(before));
  });

  it("目标已存在（再跑一次）：拒绝执行，什么都不改", async () => {
    const { pluginDir, repo } = await fixture();
    await runTaskfoldSqliteMigration({ pluginDir, mode: "apply" });
    const snapshot = JSON.stringify(fs.readdirSync(path.join(repo, ".taskfold", "cards")).toSorted());
    const backups = fs.readdirSync(path.join(pluginDir, "backup")).length;

    await expect(runTaskfoldSqliteMigration({ pluginDir, mode: "apply" })).rejects.toThrow(/already exists/);
    const dryRun = await runTaskfoldSqliteMigration({ pluginDir, mode: "dry-run" });
    expect(dryRun.blockers.join("\n")).toContain(path.join(pluginDir, "projects.json"));
    expect(dryRun.blockers.join("\n")).toContain(path.join(repo, ".taskfold"));
    expect(JSON.stringify(fs.readdirSync(path.join(repo, ".taskfold", "cards")).toSorted())).toBe(snapshot);
    expect(fs.readdirSync(path.join(pluginDir, "backup")).length).toBe(backups);
  });

  it("中途失败（仓库写完、插件目录写不进去）：删掉已写的临时目录，不留 projects.json，原库不动", async () => {
    const { pluginDir, sqlitePath, repo } = await fixture();
    const sqliteHash = sha256(sqlitePath);
    // 仓库项目排在前面、先写成功；轮到 default（插件目录下）时 mkdir 失败。
    fs.mkdirSync(path.join(pluginDir, "backup"));
    chmodFor(pluginDir, 0o555);

    await expect(runTaskfoldSqliteMigration({ pluginDir, mode: "apply" })).rejects.toThrow(/EACCES/);

    expect(fs.readdirSync(repo).filter((name) => name.startsWith(".taskfold"))).toEqual([]);
    expect(
      fs.readdirSync(pluginDir).filter((name) => name !== "backup" && !name.startsWith("taskfold.sqlite")),
    ).toEqual([]);
    expect(sha256(sqlitePath)).toBe(sqliteHash);
  });

  it("不传 --apply 之外的任何东西也不会碰三份历史库：它们不可读时照样迁移成功", async () => {
    const { pluginDir, legacy } = await fixture();
    for (const { file } of legacy) {
      expect(() => fs.readFileSync(file)).toThrow(/EACCES/);
    }
    await expect(runTaskfoldSqliteMigration({ pluginDir, mode: "apply" })).resolves.toMatchObject({ applied: true });
  });
});
