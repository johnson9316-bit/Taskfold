// TASK-8：core 的 `move` / `moveMilestone` 新增可选参数 `{ expectedRevision }`（VS Code 看板的
// 拖拽 CAS）。这里既验证「传了就严格比对、不重试」，也验证「不传时行为与原来一样」——包括
// OpenClaw 网关那条路径：网关不转发这个参数，请求里就算带了 expectedRevision 也照旧成功。
import { describe, expect, it } from "vitest";
import type { OpenClawPluginApi } from "../packages/openclaw/src/backend/api.js";
import type {
  PersistedTaskfoldAttachment,
  PersistedTaskfoldBoard,
  PersistedTaskfoldCard,
  PersistedTaskfoldMilestone,
  PersistedTaskfoldNotificationSubscription,
  PersistedTaskfoldProjectDocument,
  TaskfoldKeyedStore,
} from "@taskfold/core/persistence-types.js";
import { TaskfoldRevisionConflictError } from "@taskfold/core/store-core.js";
import { registerTaskfoldGatewayMethods } from "../packages/openclaw/src/backend/src/gateway.js";
import { TaskfoldStore } from "../packages/openclaw/src/backend/src/store.js";
import { keyedStore } from "./helpers/memory-keyed-store.js";

/** cards store：`arm()` 之后的下一次 compareAndSwap 之前，模拟另一个进程抢先写了这张卡。 */
function racingCardStore() {
  const inner = keyedStore<PersistedTaskfoldCard>();
  let armed = false;
  const store: TaskfoldKeyedStore<PersistedTaskfoldCard> = {
    ...inner,
    async compareAndSwap(key, expectedRevision, value, onReject) {
      if (armed) {
        armed = false;
        const current = await inner.lookup(key);
        if (current) {
          current.card.revision += 1;
          current.card.title = "written concurrently";
          await inner.register(key, current);
        }
      }
      return await inner.compareAndSwap!(key, expectedRevision, value, onReject);
    },
  };
  return { store, arm: () => (armed = true) };
}

function createStore(cards: TaskfoldKeyedStore<PersistedTaskfoldCard> = keyedStore()): TaskfoldStore {
  return new TaskfoldStore(cards, {
    boards: keyedStore<PersistedTaskfoldBoard>(),
    milestones: keyedStore<PersistedTaskfoldMilestone>(),
    documents: keyedStore<PersistedTaskfoldProjectDocument>(),
    subscriptions: keyedStore<PersistedTaskfoldNotificationSubscription>(),
    attachments: keyedStore<PersistedTaskfoldAttachment>(),
  });
}

async function seed(store: TaskfoldStore) {
  const project = await store.createProject({ id: "demo", name: "Demo", initialMilestoneTitle: "M1" });
  const milestone = project.milestones[0]!;
  const card = await store.create({ boardId: "demo", title: "Card", status: "todo" });
  return { milestone, card };
}

function registerMethods(store: TaskfoldStore) {
  const handlers = new Map<string, (request: any) => Promise<void>>();
  const api = {
    runtime: {},
    registerGatewayMethod(name: string, handler: (request: any) => Promise<void>) {
      handlers.set(name, handler);
    },
  } as unknown as OpenClawPluginApi;
  registerTaskfoldGatewayMethods({ api, store });
  return async (method: string, params: Record<string, unknown>) => {
    const handler = handlers.get(method);
    if (!handler) {
      throw new Error(`${method} was not registered`);
    }
    const responses: Array<{ ok: boolean; payload?: any; error?: any }> = [];
    await handler({
      params,
      context: { getRuntimeConfig: () => ({}) },
      respond: (ok: boolean, payload?: unknown, error?: unknown) => responses.push({ ok, payload, error }),
    });
    expect(responses).toHaveLength(1);
    return responses[0]!;
  };
}

describe("move with expectedRevision", () => {
  it("writes when the card is still at the expected revision", async () => {
    const store = createStore();
    const { card } = await seed(store);
    const moved = await store.move(card.id, "review", undefined, undefined, { expectedRevision: card.revision });
    expect(moved.status).toBe("review");
    expect(moved.revision).toBeGreaterThan(card.revision);
  });

  it("rejects a stale revision without retrying or writing", async () => {
    const store = createStore();
    const { card } = await seed(store);
    const other = await store.update(card.id, { title: "changed elsewhere" });
    await expect(
      store.move(card.id, "review", undefined, undefined, { expectedRevision: card.revision }),
    ).rejects.toBeInstanceOf(TaskfoldRevisionConflictError);
    const after = await store.get(card.id);
    expect(after).toMatchObject({ status: "todo", revision: other.revision, title: "changed elsewhere" });
  });

  it("does not retry a CAS lost to a concurrent write when a revision is given", async () => {
    const cards = racingCardStore();
    const store = createStore(cards.store);
    const { card } = await seed(store);
    cards.arm();
    await expect(
      store.move(card.id, "review", undefined, undefined, { expectedRevision: card.revision }),
    ).rejects.toBeInstanceOf(TaskfoldRevisionConflictError);
    expect((await store.get(card.id))?.status).toBe("todo");
  });

  it("without the option still re-reads and retries a lost CAS, as before", async () => {
    const cards = racingCardStore();
    const store = createStore(cards.store);
    const { card } = await seed(store);
    cards.arm();
    const moved = await store.move(card.id, "review", undefined);
    expect(moved).toMatchObject({ status: "review", title: "written concurrently" });
  });
});

describe("moveMilestone with expectedRevision", () => {
  it("writes when the card is still at the expected revision", async () => {
    const store = createStore();
    const { card, milestone } = await seed(store);
    const moved = await store.moveMilestone(card.id, { milestoneId: milestone.id }, { expectedRevision: card.revision });
    expect(moved.milestoneId).toBe(milestone.id);
  });

  it("rejects a stale revision without writing", async () => {
    const store = createStore();
    const { card, milestone } = await seed(store);
    await store.update(card.id, { title: "changed elsewhere" });
    await expect(
      store.moveMilestone(card.id, { milestoneId: milestone.id }, { expectedRevision: card.revision }),
    ).rejects.toBeInstanceOf(TaskfoldRevisionConflictError);
    expect((await store.get(card.id))?.milestoneId).toBeUndefined();
  });

  it("does not retry a CAS lost to a concurrent write when a revision is given", async () => {
    const cards = racingCardStore();
    const store = createStore(cards.store);
    const { card, milestone } = await seed(store);
    cards.arm();
    await expect(
      store.moveMilestone(card.id, { milestoneId: milestone.id }, { expectedRevision: card.revision }),
    ).rejects.toBeInstanceOf(TaskfoldRevisionConflictError);
    expect((await store.get(card.id))?.milestoneId).toBeUndefined();
  });

  it("without the option still re-reads and retries a lost CAS, as before", async () => {
    const cards = racingCardStore();
    const store = createStore(cards.store);
    const { card, milestone } = await seed(store);
    cards.arm();
    const moved = await store.moveMilestone(card.id, { milestoneId: milestone.id });
    expect(moved).toMatchObject({ milestoneId: milestone.id, title: "written concurrently" });
  });
});

describe("OpenClaw gateway does not forward expectedRevision to move / moveMilestone", () => {
  it("taskfold.cards.move ignores a stale expectedRevision in the request", async () => {
    const store = createStore();
    const { card } = await seed(store);
    await store.update(card.id, { title: "changed elsewhere" });
    const call = registerMethods(store);
    const response = await call("taskfold.cards.move", {
      id: card.id,
      status: "review",
      expectedRevision: card.revision,
    });
    expect(response.ok).toBe(true);
    expect(response.payload.card).toMatchObject({ status: "review", title: "changed elsewhere" });
  });

  it("taskfold.cards.moveMilestone ignores a stale expectedRevision in the request", async () => {
    const store = createStore();
    const { card, milestone } = await seed(store);
    await store.update(card.id, { title: "changed elsewhere" });
    const call = registerMethods(store);
    const response = await call("taskfold.cards.moveMilestone", {
      id: card.id,
      milestoneId: milestone.id,
      expectedRevision: card.revision,
    });
    expect(response.ok).toBe(true);
    expect(response.payload.card).toMatchObject({ milestoneId: milestone.id, title: "changed elsewhere" });
  });

  it("taskfold.cards.move still retries a CAS lost to a concurrent write", async () => {
    const cards = racingCardStore();
    const store = createStore(cards.store);
    const { card } = await seed(store);
    const call = registerMethods(store);
    cards.arm();
    const response = await call("taskfold.cards.move", { id: card.id, status: "review" });
    expect(response.ok).toBe(true);
    expect(response.payload.card).toMatchObject({ status: "review", title: "written concurrently" });
  });

  it("taskfold.cards.moveMilestone still retries a CAS lost to a concurrent write", async () => {
    const cards = racingCardStore();
    const store = createStore(cards.store);
    const { card, milestone } = await seed(store);
    const call = registerMethods(store);
    cards.arm();
    const response = await call("taskfold.cards.moveMilestone", { id: card.id, milestoneId: milestone.id });
    expect(response.ok).toBe(true);
    expect(response.payload.card).toMatchObject({ milestoneId: milestone.id, title: "written concurrently" });
  });
});
