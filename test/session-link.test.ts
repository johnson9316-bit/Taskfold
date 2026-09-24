import { describe, expect, it } from "vitest";
import type {
  TaskfoldKeyedStore,
  PersistedTaskfoldAttachment,
  PersistedTaskfoldBoard,
  PersistedTaskfoldCard,
  PersistedTaskfoldMilestone,
  PersistedTaskfoldNotificationSubscription,
  PersistedTaskfoldProjectDocument,
} from "@taskfold/core/persistence-types.js";
import {
  buildSessionKey,
  taskfoldCardMatchesLifecycleLink,
  taskfoldCardSessionLookupKey,
} from "@taskfold/core/session-link.js";
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

/** A card mid-launch: claimed and holding a `prepared` launch, not yet accepted. */
async function createPreparedLaunchCard(store: TaskfoldStore, title: string) {
  const created = await store.create({ title, status: "ready" });
  const claimed = await store.claimExecution(created.id, {
    ownerId: "owner-a",
    expectedRevision: created.revision,
  });
  const sessionKey = buildSessionKey(claimed.card);
  return await store.openExecutionLaunch(claimed.card.id, { requestedSessionKey: sessionKey });
}

describe("Taskfold session-link matching (需求/15.7 步骤 5)", () => {
  describe("taskfoldCardSessionLookupKey", () => {
    it("strips a leading agent scope but leaves an unscoped key untouched", () => {
      expect(taskfoldCardSessionLookupKey("agent:main:subagent:taskfold-default-card-1")).toBe(
        "subagent:taskfold-default-card-1",
      );
      expect(taskfoldCardSessionLookupKey("subagent:taskfold-default-card-1")).toBe(
        "subagent:taskfold-default-card-1",
      );
      expect(taskfoldCardSessionLookupKey(undefined)).toBeUndefined();
    });
  });

  describe("taskfoldCardMatchesLifecycleLink", () => {
    it("falls back to a normalized session key when the card still holds a provisional runId", () => {
      const provisional = {
        id: "card-1",
        title: "t",
        status: "running" as const,
        priority: "normal" as const,
        labels: [],
        position: 1000,
        createdAt: 0,
        updatedAt: 0,
        revision: 1,
        sessionKey: "subagent:taskfold-default-card-1",
        runId: "taskfold:card-1:token-a",
      };
      // Host reports the agent-scoped form; the card stored the unscoped tail.
      expect(
        taskfoldCardMatchesLifecycleLink(provisional, {
          runId: "run-real-host-id",
          sessionKey: "agent:main:subagent:taskfold-default-card-1",
        }),
      ).toBe(true);
      // And the reverse spelling also matches.
      const agentScoped = { ...provisional, sessionKey: "agent:main:subagent:taskfold-default-card-1" };
      expect(
        taskfoldCardMatchesLifecycleLink(agentScoped, {
          runId: "run-real-host-id",
          sessionKey: "subagent:taskfold-default-card-1",
        }),
      ).toBe(true);
    });

    it("never falls back to session key once the card holds a different real runId", () => {
      const accepted = {
        id: "card-1",
        title: "t",
        status: "running" as const,
        priority: "normal" as const,
        labels: [],
        position: 1000,
        createdAt: 0,
        updatedAt: 0,
        revision: 1,
        sessionKey: "subagent:taskfold-default-card-1",
        runId: "run-already-accepted",
      };
      // A late/duplicate event for a run this card has already moved past.
      expect(
        taskfoldCardMatchesLifecycleLink(accepted, {
          runId: "run-stale-superseded",
          sessionKey: "subagent:taskfold-default-card-1",
        }),
      ).toBe(false);
    });
  });

  describe("finishExecutionForRun session-key fallback (store integration)", () => {
    it("resolves a run whose card only has the provisional runId, via targetSessionKey alone", async () => {
      const store = createStore();
      const { card, launch } = await createPreparedLaunchCard(store, "Restart-orphaned launch");

      // Simulates the host replaying a terminal event after a Gateway restart:
      // it carries the real runId the host minted, which the card never
      // recorded, plus the agent-scoped session key form.
      const resolved = await store.finishExecutionForRun(undefined, {
        outcome: "ok",
        targetSessionKey: `agent:main:${launch.requestedSessionKey}`,
      });

      expect(resolved?.id).toBe(card.id);
      expect(resolved?.execution?.status).toBe("done");
      expect(resolved?.metadata?.claim).toBeUndefined();
    });

    it("does not misroute a resolution meant for one card onto another card's session", async () => {
      const store = createStore();
      const { card: cardA, launch: launchA } = await createPreparedLaunchCard(store, "Card A");
      const { card: cardB } = await createPreparedLaunchCard(store, "Card B");

      const resolved = await store.finishExecutionForRun(undefined, {
        outcome: "ok",
        targetSessionKey: launchA.requestedSessionKey,
      });

      expect(resolved?.id).toBe(cardA.id);
      const untouchedB = await store.get(cardB.id);
      expect(untouchedB?.execution?.status).toBe("running");
      expect(untouchedB?.metadata?.automation?.launch).toMatchObject({ phase: "prepared" });
    });

    it("stays idempotent on a repeated terminal event for the same card", async () => {
      const store = createStore();
      const { card, launch } = await createPreparedLaunchCard(store, "Repeated terminal event");

      const completed = await store.finishExecutionForRun(undefined, {
        outcome: "ok",
        targetSessionKey: launch.requestedSessionKey,
      });
      const repeated = await store.finishExecutionForRun(undefined, {
        outcome: "error",
        reason: "late duplicate event",
        targetSessionKey: launch.requestedSessionKey,
      });

      expect(repeated).toEqual(completed);
      expect(card.id).toBe(completed?.id);
    });

    it("requires at least a runId or a targetSessionKey", async () => {
      const store = createStore();
      await expect(store.finishExecutionForRun(undefined, {})).rejects.toThrow(
        "runId or targetSessionKey is required.",
      );
    });
  });
});
