import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { TaskfoldStatusDefinition } from "@taskfold/core/contract/index.js";
import { createTaskfoldFileStores } from "@taskfold/core/file-store.js";
import { cardPhase } from "@taskfold/core/card-phase.js";
import { resolveStatusRegistry } from "@taskfold/core/status-registry.js";
import { TaskfoldStore } from "../packages/openclaw/src/backend/src/store.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

// 项目自定义的状态集：状态名与默认集完全不同，引擎只能靠类别与 role 找落点。
const custom: TaskfoldStatusDefinition[] = [
  { id: "idea", category: "unstarted", role: "intake" },
  { id: "next", category: "unstarted", default: true },
  { id: "dev", name: "开发中", category: "started" },
  { id: "qa", name: "测试中", category: "started", role: "review" },
  { id: "shipped", category: "completed" },
  { id: "dropped", category: "cancelled" },
];

async function setup(statuses?: TaskfoldStatusDefinition[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-status-engine-"));
  roots.push(root);
  const dataDir = path.join(root, "repo", ".taskfold");
  const stores = createTaskfoldFileStores({ dataDir });
  const store = TaskfoldStore.fromStores(stores);
  if (statuses) await store.saveStatuses("demo", statuses);
  const registry = resolveStatusRegistry(statuses);
  const phase = async (id: string, now = Date.now()) => cardPhase((await store.get(id))!, registry, now);
  return { store, dataDir, registry, phase };
}

describe("引擎只认类别与 role：自定义状态集", () => {
  it("新卡落在默认的未开始状态；认领后进入第一个进行中状态；完成进入第一个已完成状态", async () => {
    const { store, phase } = await setup(custom);
    const card = await store.create({ title: "A", boardId: "demo" });
    expect(card.status).toBe("next");

    const claimed = await store.claim(card.id, { ownerId: "worker", ttlSeconds: 60 });
    expect(claimed.card.status).toBe("dev");
    expect(await phase(card.id)).toBe("running");

    const done = await store.complete(card.id, { summary: "ok", ownerId: "worker", token: claimed.token });
    expect(done.status).toBe("shipped");
    expect(done.completedAt).toBeTypeOf("number");
  });

  it("阻塞只加标记，卡留在原状态；解除阻塞退回默认未开始状态", async () => {
    const { store, phase } = await setup(custom);
    const card = await store.create({ title: "A", boardId: "demo" });
    const claimed = await store.claim(card.id, { ownerId: "worker", ttlSeconds: 60 });

    const blocked = await store.block(card.id, {
      reason: "等接口",
      ownerId: "worker",
      token: claimed.token,
    });
    expect(blocked.status).toBe("dev");
    expect(blocked.metadata?.blocked).toMatchObject({ reason: "等接口" });
    expect(await phase(card.id)).toBe("blocked");
    expect((blocked.events ?? []).some((event) => event.kind === "blocked")).toBe(true);

    const unblocked = await store.unblock(card.id);
    expect(unblocked.status).toBe("next");
    expect(unblocked.metadata?.blocked).toBeUndefined();
    expect(await phase(card.id)).toBe("todo");
    // 状态换了（进行中 → 待办）记成一次移动；只收回标记时才是 unblocked 事件。
    expect(unblocked.events?.at(-1)).toMatchObject({ kind: "moved", fromStatus: "dev", toStatus: "next" });
    const parked = await store.create({ title: "B", boardId: "demo" });
    await store.block(parked.id, { reason: "等人" });
    const cleared = await store.unblock(parked.id);
    expect(cleared.status).toBe("next");
    expect(cleared.events?.at(-1)?.kind).toBe("unblocked");
  });

  it("specify 把 intake 状态里的卡移到默认未开始状态", async () => {
    const { store, phase } = await setup(custom);
    const card = await store.create({ title: "A", boardId: "demo", status: "idea" });
    expect(await phase(card.id)).toBe("triage");

    const specified = await store.specify(card.id, { summary: "拆清楚了" });
    expect(specified.status).toBe("next");
    expect(await phase(card.id)).toBe("todo");
  });

  it("已有进行中的卡不能被 specify", async () => {
    const { store } = await setup(custom);
    const card = await store.create({ title: "A", boardId: "demo", status: "dev" });
    await expect(store.specify(card.id, {})).rejects.toThrow(/can be specified/);
  });

  it("里程碑完成：已取消的卡也算办完", async () => {
    const { store } = await setup(custom);
    const milestone = await store.createMilestone({ boardId: "demo", title: "M1" });
    const a = await store.create({ title: "A", boardId: "demo", milestoneId: milestone.id, status: "shipped" });
    const b = await store.create({ title: "B", boardId: "demo", milestoneId: milestone.id, status: "dropped" });
    expect([a.status, b.status]).toEqual(["shipped", "dropped"]);
    await expect(store.completeMilestone(milestone.id)).resolves.toBeTruthy();
  });

  it("创建时 started 状态 + 有父卡：退回默认未开始状态", async () => {
    const { store } = await setup(custom);
    const parent = await store.create({ title: "P", boardId: "demo" });
    const child = await store.create({ title: "C", boardId: "demo", status: "dev", parents: [parent.id] });
    expect(child.status).toBe("next");
  });
});

describe("派发标记（原 ready）", () => {
  it("promote 打标记、状态不变；已派发的卡再 promote 不会把标记清掉", async () => {
    const { store, phase } = await setup(custom);
    const card = await store.create({ title: "A", boardId: "demo" });
    const first = await store.promote(card.id);
    expect(first.status).toBe("next");
    expect(first.metadata?.dispatchReady).toBe(true);
    expect(await phase(card.id)).toBe("ready");
    expect(first.events?.some((event) => event.kind === "queued")).toBe(true);

    const second = await store.promote(card.id, { reason: "再来一次" });
    expect(second.metadata?.dispatchReady).toBe(true);
    expect(await phase(card.id)).toBe("ready");
  });

  it("显式把状态改回去会收回派发标记（旧的 ready → todo）", async () => {
    const { store, phase } = await setup(custom);
    const card = await store.create({ title: "A", boardId: "demo" });
    await store.promote(card.id);

    const back = await store.update(card.id, { status: "next" });
    expect(back.metadata?.dispatchReady).toBeUndefined();
    expect(await phase(card.id)).toBe("todo");
    expect(back.events?.some((event) => event.kind === "unqueued")).toBe(true);
  });

  it("移到别的状态会清掉原样带过来的标记", async () => {
    const { store, phase } = await setup(custom);
    const card = await store.create({ title: "A", boardId: "demo" });
    await store.promote(card.id);

    const moved = await store.move(card.id, "dev", undefined);
    expect(moved.metadata?.dispatchReady).toBeUndefined();
    expect(await phase(card.id)).toBe("running");
  });

  it("旧值输入：status=ready 被翻译成默认状态 + 派发标记", async () => {
    const { store, phase } = await setup(custom);
    const created = await store.create({ title: "A", boardId: "demo", status: "ready" });
    expect(created.status).toBe("next");
    expect(created.metadata?.dispatchReady).toBe(true);
    expect(await phase(created.id)).toBe("ready");

    const other = await store.create({ title: "B", boardId: "demo" });
    const moved = await store.move(other.id, "ready", undefined);
    expect(moved.status).toBe("next");
    expect(await phase(other.id)).toBe("ready");
  });

  it("旧值输入：status=blocked 被翻译成阻塞标记，卡留在原状态", async () => {
    const { store, phase } = await setup(custom);
    const card = await store.create({ title: "A", boardId: "demo", status: "dev" });
    const blocked = await store.move(card.id, "blocked", undefined);
    expect(blocked.status).toBe("dev");
    expect(await phase(card.id)).toBe("blocked");
  });
});

describe("依赖与定时", () => {
  it("所有父卡完成后，子卡被 dispatch 放行（打派发标记）；父卡没完成时不放行", async () => {
    const { store, phase } = await setup(custom);
    const parent = await store.create({ title: "P", boardId: "demo" });
    const child = await store.create({ title: "C", boardId: "demo", parents: [parent.id] });
    expect(await phase(child.id)).toBe("todo");

    const claimed = await store.claim(parent.id, { ownerId: "worker", ttlSeconds: 60 });
    await store.complete(parent.id, { summary: "done", ownerId: "worker", token: claimed.token });

    // 依赖提升发生在下一轮 dispatch
    const result = await store.dispatch(Date.now());
    expect(result.promoted.map((entry) => entry.id)).toContain(child.id);
    expect(await phase(child.id)).toBe("ready");
    expect((await store.get(child.id))?.status).toBe("next");
    expect((await store.get(child.id))?.metadata?.automation?.dispatchCount).toBe(1);
  });

  it("定时：创建时 scheduledAt 在将来 → scheduled，状态仍是未开始；到点由 dispatch 放行一次", async () => {
    const { store, phase } = await setup(custom);
    const now = Date.now();
    const card = await store.create({ title: "A", boardId: "demo", scheduledAt: now + 3_600_000 });
    expect(card.status).toBe("next");
    expect(await phase(card.id, now)).toBe("scheduled");

    await store.dispatch(now + 60_000);
    expect(await phase(card.id, now + 60_000)).toBe("scheduled");

    await store.dispatch(now + 3_600_001);
    expect(await phase(card.id, now + 3_600_001)).toBe("ready");
  });

  it("到点放行之后人工退回待办，不会被再次放行", async () => {
    const { store, phase } = await setup(custom);
    const now = Date.now();
    const card = await store.create({ title: "A", boardId: "demo", scheduledAt: now + 1_000 });
    await store.dispatch(now + 2_000);
    expect(await phase(card.id, now + 2_000)).toBe("ready");

    // 人工收回：更新时间晚于定时点，且已经派发过
    await store.update(card.id, { status: "next" });
    await store.dispatch(Date.now() + 5_000);
    expect(await phase(card.id, Date.now() + 5_000)).toBe("todo");
  });

  it("claim 一张定时未到的卡被拒绝", async () => {
    const { store } = await setup(custom);
    const card = await store.create({ title: "A", boardId: "demo", scheduledAt: Date.now() + 3_600_000 });
    await expect(store.claim(card.id, { ownerId: "worker" })).rejects.toThrow("card is scheduled for later.");
  });

  it("promote 一张定时未到的卡被拒绝，force 可以越过", async () => {
    const { store } = await setup(custom);
    const card = await store.create({ title: "A", boardId: "demo", scheduledAt: Date.now() + 3_600_000 });
    await expect(store.promote(card.id)).rejects.toThrow("card is scheduled for later.");
    await expect(store.promote(card.id, { force: true })).resolves.toMatchObject({
      metadata: { dispatchReady: true },
    });
  });
});

describe("磁盘上的旧值：读取兼容，写入换成新表示", () => {
  it("手写的 `status: ready` 卡片被识别为 ready，认领后写成新表示", async () => {
    const { store, dataDir } = await setup();
    const card = await store.create({ title: "A", boardId: "demo" });
    const cardsDir = path.join(dataDir, "cards");
    const file = fs.readdirSync(cardsDir).find((name) => name.endsWith(".md"))!;
    const filePath = path.join(cardsDir, file);
    fs.writeFileSync(filePath, fs.readFileSync(filePath, "utf8").replace(/^status: .*$/m, "status: ready"));

    const legacy = (await store.get(card.id))!;
    expect(legacy.status).toBe("ready");
    expect(cardPhase(legacy, resolveStatusRegistry())).toBe("ready");

    const claimed = await store.claim(card.id, { ownerId: "worker", ttlSeconds: 60 });
    expect(claimed.card.status).toBe("running");
    expect(claimed.card.metadata?.dispatchReady).toBeUndefined();
    expect(fs.readFileSync(filePath, "utf8")).toMatch(/^status: running$/m);
  });

  it("旧的 blocked 卡：unblock 回到 todo", async () => {
    const { store, dataDir } = await setup();
    const card = await store.create({ title: "A", boardId: "demo" });
    const cardsDir = path.join(dataDir, "cards");
    const file = fs.readdirSync(cardsDir).find((name) => name.endsWith(".md"))!;
    const filePath = path.join(cardsDir, file);
    fs.writeFileSync(filePath, fs.readFileSync(filePath, "utf8").replace(/^status: .*$/m, "status: blocked"));

    expect(cardPhase((await store.get(card.id))!, resolveStatusRegistry())).toBe("blocked");
    const unblocked = await store.unblock(card.id);
    expect(unblocked.status).toBe("todo");
  });
});
