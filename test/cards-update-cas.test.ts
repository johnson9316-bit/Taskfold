import { describe, expect, it } from "vitest";
import type { OpenClawPluginApi } from "../src/backend/api.js";
import type {
  PersistedTaskfoldAttachment,
  PersistedTaskfoldBoard,
  PersistedTaskfoldCard,
  PersistedTaskfoldMilestone,
  PersistedTaskfoldNotificationSubscription,
  PersistedTaskfoldProjectDocument,
  TaskfoldKeyedStore,
} from "@taskfold/core/persistence-types.js";
import { registerTaskfoldGatewayMethods } from "../src/backend/src/gateway.js";
import { TaskfoldStore } from "../src/backend/src/store.js";

function keyedStore<T>(): TaskfoldKeyedStore<T> {
  const values = new Map<string, T>();
  return {
    async register(key, value) {
      values.set(key, value);
    },
    async lookup(key) {
      return values.get(key);
    },
    async delete(key) {
      return values.delete(key);
    },
    async entries() {
      return [...values.entries()].map(([key, value]) => ({ key, value }));
    },
  };
}

function createStore(): TaskfoldStore {
  return new TaskfoldStore(keyedStore<PersistedTaskfoldCard>(), {
    boards: keyedStore<PersistedTaskfoldBoard>(),
    milestones: keyedStore<PersistedTaskfoldMilestone>(),
    documents: keyedStore<PersistedTaskfoldProjectDocument>(),
    subscriptions: keyedStore<PersistedTaskfoldNotificationSubscription>(),
    attachments: keyedStore<PersistedTaskfoldAttachment>(),
  });
}

function registerCardsUpdate(store: TaskfoldStore) {
  const registrations = new Map<
    string,
    { handler: (request: any) => Promise<void>; options: { scope: string } }
  >();
  const api = {
    runtime: {},
    registerGatewayMethod(name: string, handler: (request: any) => Promise<void>, options: any) {
      registrations.set(name, { handler, options });
    },
  } as unknown as OpenClawPluginApi;
  registerTaskfoldGatewayMethods({ api, store });

  const update = registrations.get("taskfold.cards.update");
  if (!update) {
    throw new Error("taskfold.cards.update method was not registered");
  }
  return update;
}

async function callUpdate(
  update: { handler: (request: any) => Promise<void> },
  params: Record<string, unknown>,
): Promise<{ ok: boolean; payload?: any }> {
  const responses: Array<{ ok: boolean; payload?: any }> = [];
  await update.handler({
    params,
    context: { getRuntimeConfig: () => ({}) },
    respond: (ok: boolean, payload?: unknown) => responses.push({ ok, payload }),
  });
  if (responses.length !== 1) {
    throw new Error(`expected exactly one response, got ${responses.length}`);
  }
  return responses[0];
}

describe("taskfold.cards.update CAS", () => {
  it("registers taskfold.cards.update with write scope", async () => {
    const update = registerCardsUpdate(createStore());
    expect(update.options.scope).toBe("operator.write");
  });

  it("applies the patch when expectedRevision matches the current revision", async () => {
    const store = createStore();
    const card = await store.captureSession({ title: "Original", sessionKey: "agent:main:a" });
    const update = registerCardsUpdate(store);

    const response = await callUpdate(update, {
      id: card.id,
      patch: { title: "Rebased onto current revision" },
      expectedRevision: card.revision,
    });

    expect(response.ok).toBe(true);
    expect(response.payload.card).toMatchObject({
      id: card.id,
      title: "Rebased onto current revision",
    });
    expect(response.payload.card.revision).toBeGreaterThan(card.revision);
  });

  it("rejects a stale expectedRevision with a structured taskfold_conflict carrying the current card", async () => {
    const store = createStore();
    const card = await store.captureSession({ title: "Original", sessionKey: "agent:main:c" });
    const worked = await store.update(card.id, { title: "Written by worker" });
    const update = registerCardsUpdate(store);

    const responses: Array<{ ok: boolean; payload?: unknown; error?: unknown }> = [];
    await update.handler({
      params: {
        id: card.id,
        patch: { title: "Stale edit from operator" },
        expectedRevision: card.revision,
      },
      context: { getRuntimeConfig: () => ({}) },
      respond: (ok: boolean, payload?: unknown, error?: unknown) =>
        responses.push({ ok, payload, error }),
    });

    expect(responses).toHaveLength(1);
    expect(responses[0].ok).toBe(false);
    expect(responses[0].error).toMatchObject({
      code: "taskfold_conflict",
      details: {
        type: "taskfold_card_conflict",
        card: {
          id: card.id,
          title: "Written by worker",
          revision: worked.revision,
        },
      },
    });
  });

  it("keeps last-writer-wins when expectedRevision is omitted", async () => {
    const store = createStore();
    const card = await store.captureSession({ title: "Original", sessionKey: "agent:main:d" });
    // A worker writes to the card out of band, without the gateway caller knowing.
    await store.update(card.id, { title: "Written by worker" });
    const update = registerCardsUpdate(store);

    const response = await callUpdate(update, {
      id: card.id,
      patch: { title: "Overwritten by UI without expectedRevision" },
    });

    expect(response.ok).toBe(true);
    expect(response.payload.card.title).toBe("Overwritten by UI without expectedRevision");
  });

  it("does not fold expectedRevision into the card patch when the request omits the patch key", async () => {
    const store = createStore();
    const card = await store.captureSession({ title: "Original", sessionKey: "agent:main:e" });
    const update = registerCardsUpdate(store);

    // No "patch" key: readPatch() would otherwise treat the whole params object,
    // expectedRevision included, as the card patch.
    const response = await callUpdate(update, {
      id: card.id,
      title: "Rebased directly on params",
      expectedRevision: card.revision,
    });

    expect(response.ok).toBe(true);
    expect(response.payload.card.title).toBe("Rebased directly on params");
    expect(Object.hasOwn(response.payload.card, "expectedRevision")).toBe(false);
    expect(response.payload.card.metadata?.expectedRevision).toBeUndefined();
  });
});
