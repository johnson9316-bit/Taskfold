import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { TaskfoldCard } from "@taskfold/core/contract/index.js";
import { createTaskfoldFileStores } from "@taskfold/core/file-store.js";
import { cardPhase } from "@taskfold/core/card-phase.js";
import { parseTaskfoldStatusesConfig } from "@taskfold/core/file-store-statuses.js";
import { createStatusRegistry } from "@taskfold/core/status-registry.js";
import { defaultMigratedStatuses, planStatusMigration } from "@taskfold/core/status-migration.js";
import { TaskfoldStore } from "../packages/openclaw/src/backend/src/store.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fakeCard(id: string, status: string, extra: Partial<TaskfoldCard> = {}): TaskfoldCard {
  return { id, title: id, status, priority: "normal", labels: [], position: 1, createdAt: 1, updatedAt: 1, revision: 1, ...extra };
}

describe("planStatusMigration", () => {
  it("没配置：默认 5 个状态；triage / backlog 只在有卡用到时才登记，todo 显式为默认", () => {
    const plain = planStatusMigration([fakeCard("a", "todo"), fakeCard("b", "done")], undefined);
    expect(plain.statuses.map((status) => status.id)).toEqual(["todo", "running", "review", "done", "cancelled"]);
    expect(plain.writeStatuses).toBe(true);
    expect(plain.rewrites).toEqual([]);

    const used = planStatusMigration([fakeCard("a", "triage"), fakeCard("b", "backlog"), fakeCard("c", "todo")], undefined);
    expect(used.statuses.map((status) => status.id)).toEqual([
      "triage",
      "backlog",
      "todo",
      "running",
      "review",
      "done",
      "cancelled",
    ]);
    expect(createStatusRegistry(used.statuses).defaultStatus).toBe("todo");
    expect(createStatusRegistry(used.statuses).withRole("intake")).toBe("triage");
    expect(defaultMigratedStatuses({ triage: 1 }).map((status) => status.id)).toContain("triage");
  });

  it("退役状态按旧含义换成新表示", () => {
    const plan = planStatusMigration(
      [fakeCard("r", "ready"), fakeCard("s", "scheduled"), fakeCard("b", "blocked"), fakeCard("d", "done")],
      undefined,
    );
    expect(plan.rewrites).toEqual([
      { cardId: "r", from: "ready", to: "todo" },
      { cardId: "s", from: "scheduled", to: "todo" },
      { cardId: "b", from: "blocked", to: "running" },
    ]);
    expect(plan.usage).toEqual({ ready: 1, scheduled: 1, blocked: 1, done: 1 });
  });

  it("已配置：沿用配置，不再写；在用却不在列表里的状态是孤儿", () => {
    const configured = [
      { id: "next", category: "unstarted" as const },
      { id: "shipped", category: "completed" as const },
    ];
    const plan = planStatusMigration([fakeCard("a", "next"), fakeCard("b", "weird")], configured);
    expect(plan.writeStatuses).toBe(false);
    expect(plan.orphans).toEqual(["weird"]);
  });
});

async function legacyProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-status-migration-"));
  roots.push(root);
  const dataDir = path.join(root, "repo", ".taskfold");
  const store = TaskfoldStore.fromStores(createTaskfoldFileStores({ dataDir }));
  const cardsDir = path.join(dataDir, "cards");
  const configPath = path.join(dataDir, "config.yml");
  const make = async (title: string, legacyStatus: string) => {
    const card = await store.create({ title, boardId: "demo" });
    const file = fs.readdirSync(cardsDir).find((name) => name.includes(title))!;
    const filePath = path.join(cardsDir, file);
    fs.writeFileSync(filePath, fs.readFileSync(filePath, "utf8").replace(/^status: .*$/m, `status: ${legacyStatus}`));
    return { card, filePath };
  };
  const legacy = {
    ready: await make("Rdy", "ready"),
    scheduled: await make("Sch", "scheduled"),
    blocked: await make("Blk", "blocked"),
    triage: await make("Tri", "triage"),
    done: await make("Dn", "done"),
  };
  return { store, dataDir, cardsDir, configPath, legacy };
}

describe("migrateStatusModel", () => {
  it("dry-run：只出计划，什么都不写", async () => {
    const { store, configPath, legacy } = await legacyProject();
    const before = fs.readFileSync(legacy.ready.filePath, "utf8");
    const report = await store.migrateStatusModel("demo", { dryRun: true });

    expect(report).toMatchObject({ dryRun: true, changed: false, total: 5 });
    expect(report.rewrites.map((rewrite) => rewrite.from).sort()).toEqual(["blocked", "ready", "scheduled"]);
    expect(report.backupDir).toBeUndefined();
    expect(fs.readFileSync(legacy.ready.filePath, "utf8")).toBe(before);
    expect(parseTaskfoldStatusesConfig(fs.readFileSync(configPath, "utf8"))).toBeUndefined();
    expect(fs.readFileSync(configPath, "utf8")).toMatch(/^format_version: 2$/m);
  });

  it("迁移：写状态集并升到格式版本 4、重写退役卡、备份旧文件", async () => {
    const { store, configPath, dataDir, legacy } = await legacyProject();
    const originalReady = fs.readFileSync(legacy.ready.filePath, "utf8");

    const report = await store.migrateStatusModel("demo");

    expect(report).toMatchObject({ dryRun: false, changed: true, wroteStatuses: true, conflicts: [] });
    const config = fs.readFileSync(configPath, "utf8");
    expect(config).toMatch(/^format_version: 4$/m);
    expect(parseTaskfoldStatusesConfig(config)?.map((status) => status.id)).toEqual([
      "triage",
      "todo",
      "running",
      "review",
      "done",
      "cancelled",
    ]);

    const registry = await store.statusRegistryFor("demo");
    const ready = (await store.get(legacy.ready.card.id))!;
    expect(ready.status).toBe("todo");
    expect(ready.metadata?.dispatchReady).toBe(true);
    expect(cardPhase(ready, registry)).toBe("ready");
    const scheduled = (await store.get(legacy.scheduled.card.id))!;
    expect(scheduled.status).toBe("todo");
    expect(cardPhase(scheduled, registry)).toBe("todo");
    const blocked = (await store.get(legacy.blocked.card.id))!;
    expect(blocked.status).toBe("running");
    expect(blocked.metadata?.blocked).toMatchObject({ at: expect.any(Number) });
    expect(cardPhase(blocked, registry)).toBe("blocked");
    // triage 保留（它在用），done 没碰
    expect((await store.get(legacy.triage.card.id))!.status).toBe("triage");
    expect((await store.get(legacy.done.card.id))!.status).toBe("done");

    // 没有给历史留下"迁移事件"，更新时间也没动
    expect(ready.events?.some((event) => event.kind === "moved" && event.toStatus === "todo" && event.fromStatus === "ready")).toBe(false);
    expect(fs.readFileSync(legacy.ready.filePath, "utf8")).toMatch(/^status: todo$/m);

    // 备份里有迁移前的原文
    expect(report.backupDir).toContain(path.join(dataDir, ".runtime", "backup-"));
    const backedUp = fs
      .readdirSync(path.join(report.backupDir!, "cards"))
      .map((name) => fs.readFileSync(path.join(report.backupDir!, "cards", name), "utf8"));
    expect(backedUp).toContain(originalReady);
    expect(fs.existsSync(path.join(report.backupDir!, "config.yml"))).toBe(true);
  });

  it("幂等：再跑一次什么都不改、不再备份", async () => {
    const { store, dataDir } = await legacyProject();
    await store.migrateStatusModel("demo");
    const backups = fs.readdirSync(path.join(dataDir, ".runtime")).filter((name) => name.startsWith("backup-"));
    const second = await store.migrateStatusModel("demo");

    expect(second).toMatchObject({ changed: false, wroteStatuses: false, rewrites: [] });
    expect(second.backupDir).toBeUndefined();
    expect(fs.readdirSync(path.join(dataDir, ".runtime")).filter((name) => name.startsWith("backup-"))).toEqual(backups);
  });

  it("干净的项目也能迁移：写出默认 5 个状态", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-status-migration-"));
    roots.push(root);
    const dataDir = path.join(root, "repo", ".taskfold");
    const store = TaskfoldStore.fromStores(createTaskfoldFileStores({ dataDir }));
    await store.create({ title: "Only", boardId: "demo" });
    const report = await store.migrateStatusModel("demo");
    expect(report.changed).toBe(true);
    expect(report.statuses.map((status) => status.id)).toEqual(["todo", "running", "review", "done", "cancelled"]);
    expect(fs.readFileSync(path.join(dataDir, "config.yml"), "utf8")).toMatch(/^format_version: 4$/m);
  });

  it("有无法归类的状态时拒绝迁移，什么都不改", async () => {
    const { store, configPath, legacy } = await legacyProject();
    fs.writeFileSync(
      legacy.done.filePath,
      fs.readFileSync(legacy.done.filePath, "utf8").replace(/^status: .*$/m, "status: mystery"),
    );
    await expect(store.migrateStatusModel("demo")).rejects.toThrow(/mystery/);
    expect(fs.readFileSync(configPath, "utf8")).toMatch(/^format_version: 2$/m);
  });

  it("单项目后端按数据目录里的全部卡片规划：另一个 board 的 triage 卡也算在用", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-status-migration-"));
    roots.push(root);
    const dataDir = path.join(root, "repo", ".taskfold");
    const store = TaskfoldStore.fromStores(createTaskfoldFileStores({ dataDir }));
    await store.create({ title: "OnA", boardId: "a" });
    await store.create({ title: "OnB", boardId: "b", status: "triage" });
    const report = await store.migrateStatusModel("a");
    expect(report.statuses.map((status) => status.id)).toContain("triage");
    // 迁移后另一个 board 的 triage 卡仍然合法
    await expect(store.create({ title: "More", boardId: "b", status: "triage" })).resolves.toBeTruthy();
  });
});

describe("惰性升级格式版本", () => {
  it("只用旧状态、没有标记的写入不升级；第一次写入新模型的内容才升到 4", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-status-lazy-"));
    roots.push(root);
    const dataDir = path.join(root, "repo", ".taskfold");
    const store = TaskfoldStore.fromStores(createTaskfoldFileStores({ dataDir }));
    const configPath = path.join(dataDir, "config.yml");

    const card = await store.create({ title: "Plain", boardId: "demo" });
    await store.update(card.id, { status: "running" });
    expect(fs.readFileSync(configPath, "utf8")).toMatch(/^format_version: 2$/m);

    await store.promote(card.id, { force: true });
    expect(fs.readFileSync(configPath, "utf8")).toMatch(/^format_version: 4$/m);
  });

  it("写入 cancelled（旧版不认识的状态）也会升级", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-status-lazy-"));
    roots.push(root);
    const dataDir = path.join(root, "repo", ".taskfold");
    const store = TaskfoldStore.fromStores(createTaskfoldFileStores({ dataDir }));
    const card = await store.create({ title: "Plain", boardId: "demo" });
    await store.update(card.id, { status: "cancelled" });
    expect(fs.readFileSync(path.join(dataDir, "config.yml"), "utf8")).toMatch(/^format_version: 4$/m);
  });
});
