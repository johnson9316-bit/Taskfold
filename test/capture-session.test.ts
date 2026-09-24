import { describe, expect, it } from "vitest";
import type { OpenClawPluginApi } from "../src/backend/api.js";
import type {
  PersistedTaskfoldAttachment,
  PersistedTaskfoldBoard,
  PersistedTaskfoldCard,
  PersistedTaskfoldMilestone,
  PersistedTaskfoldNotificationSubscription,
  PersistedTaskfoldProjectDocument,
} from "@taskfold/core/persistence-types.js";
import { registerTaskfoldGatewayMethods } from "../src/backend/src/gateway.js";
import { TaskfoldStore } from "../src/backend/src/store.js";
import { keyedStore } from "./helpers/memory-keyed-store.js";

function createStore(): TaskfoldStore {
  return new TaskfoldStore(keyedStore<PersistedTaskfoldCard>(), {
    boards: keyedStore<PersistedTaskfoldBoard>(),
    milestones: keyedStore<PersistedTaskfoldMilestone>(),
    documents: keyedStore<PersistedTaskfoldProjectDocument>(),
    subscriptions: keyedStore<PersistedTaskfoldNotificationSubscription>(),
    attachments: keyedStore<PersistedTaskfoldAttachment>(),
  });
}

describe("Taskfold captureSession", () => {
  it("captures an already-running session into a new card", async () => {
    const store = createStore();

    const card = await store.captureSession({
      title: "Captured by agent",
      sessionKey: "agent:main:dashboard",
    });

    expect(card).toMatchObject({
      title: "Captured by agent",
      status: "todo",
      priority: "normal",
      labels: [],
      sessionKey: "agent:main:dashboard",
      revision: 1,
    });
    expect(card.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(card.events?.at(-1)).toMatchObject({
      kind: "created",
      sessionKey: "agent:main:dashboard",
    });
  });

  it("returns the same card unchanged for a repeat capture of the same sessionKey", async () => {
    const store = createStore();
    const sessionKey = "agent:main:dashboard";

    const first = await store.captureSession({ title: "First capture", sessionKey });
    const second = await store.captureSession({
      title: "Ignored on the idempotent path",
      sessionKey,
      boardId: "other",
    });

    expect(second).toEqual(first);
    expect((await store.list()).map((c) => c.id)).toEqual([first.id]);
  });

  it("restores an archived captured card instead of creating a duplicate", async () => {
    const store = createStore();
    const sessionKey = "agent:main:dashboard";

    const captured = await store.captureSession({ title: "Captured", sessionKey });
    await store.archive(captured.id, true);

    const restored = await store.captureSession({ title: "Restore", sessionKey });

    expect(restored.id).toBe(captured.id);
    expect(restored.metadata?.archivedAt).toBeUndefined();
    expect((await store.list()).filter((c) => !c.metadata?.archivedAt)).toEqual([restored]);
  });

  it("requires a sessionKey", async () => {
    const store = createStore();

    await expect(store.captureSession({ title: "No session" })).rejects.toThrow(
      "sessionKey is required.",
    );
  });
});

describe("Taskfold captureSession Gateway method", () => {
  it("registers taskfold.cards.captureSession with write scope and is idempotent over the Gateway", async () => {
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
    registerTaskfoldGatewayMethods({ api, store: createStore() });

    const captureSession = registrations.get("taskfold.cards.captureSession");
    if (!captureSession) {
      throw new Error("captureSession method was not registered");
    }
    expect(captureSession.options.scope).toBe("operator.write");

    const responses: Array<{ ok: boolean; payload?: any }> = [];
    const call = async (params: Record<string, unknown>) =>
      await captureSession.handler({
        params,
        context: { getRuntimeConfig: () => ({}) },
        respond: (ok: boolean, payload?: unknown) => responses.push({ ok, payload }),
      });

    await call({ title: "Via Gateway", sessionKey: "agent:main:gateway" });
    await call({ title: "Via Gateway again", sessionKey: "agent:main:gateway" });

    expect(responses).toHaveLength(2);
    expect(responses[0].ok).toBe(true);
    expect(responses[1].ok).toBe(true);
    expect(responses[1].payload.card.id).toBe(responses[0].payload.card.id);
  });
});
