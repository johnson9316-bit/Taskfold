import { describe, expect, it, vi } from "vitest";
import type {
  TaskfoldKeyedStore,
  PersistedTaskfoldAttachment,
  PersistedTaskfoldBoard,
  PersistedTaskfoldCard,
  PersistedTaskfoldMilestone,
  PersistedTaskfoldNotificationSubscription,
  PersistedTaskfoldProjectDocument,
} from "../src/backend/src/persistence-types.js";
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

function createStore(cardStore: TaskfoldKeyedStore<PersistedTaskfoldCard>): TaskfoldStore {
  return new TaskfoldStore(cardStore, {
    boards: keyedStore<PersistedTaskfoldBoard>(),
    milestones: keyedStore<PersistedTaskfoldMilestone>(),
    documents: keyedStore<PersistedTaskfoldProjectDocument>(),
    subscriptions: keyedStore<PersistedTaskfoldNotificationSubscription>(),
    attachments: keyedStore<PersistedTaskfoldAttachment>(),
  });
}

describe("TaskfoldStore.compensateWorkspaceMutation", () => {
  it("throws after exhausting 3 compare-and-swap attempts against a persistently conflicting store", async () => {
    const values = new Map<string, PersistedTaskfoldCard>();
    let casCalls = 0;
    const cardStore: TaskfoldKeyedStore<PersistedTaskfoldCard> = {
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
      async compareAndSwap() {
        casCalls += 1;
        // Always conflicts, no matter what is offered.
        return false;
      },
    };
    const store = createStore(cardStore);
    const created = await store.create({ title: "Compensation target", notes: "original" });
    // register() (used by the plain store.update() fallback below) still
    // works on this store; only compareAndSwap is wired to always conflict.
    const written = await store.update(created.id, { notes: "changed by the operation" });
    const before = created;
    const after = { ...created, notes: "changed by the operation", revision: written.revision };

    await expect(store.compensateWorkspaceMutation(before, after)).rejects.toThrow(
      `card changed repeatedly during compensation: ${created.id}`,
    );
    expect(casCalls).toBe(3);
  });
});

describe("decompose rollback (需求/15.8-并发与补偿设计.md §4.4)", () => {
  it("preserves a concurrent host edit to the parent card when a mid-decompose failure rolls it back", async () => {
    const sharedCards = keyedStore<PersistedTaskfoldCard>();
    const opStore = createStore(sharedCards);
    const hostStore = createStore(sharedCards);

    const parent = await opStore.create({ title: "Parent to decompose" });

    // Intercept the protected linkCardsDirect() call decompose makes once per
    // child: let the first child link normally, then fail the second to
    // abort mid-operation.
    type StoreWithLinkCardsDirect = {
      linkCardsDirect: (...args: unknown[]) => Promise<unknown>;
    };
    const opStoreInternal = opStore as unknown as StoreWithLinkCardsDirect;
    const original = opStoreInternal.linkCardsDirect.bind(opStore);
    let linkCalls = 0;
    let firstChildId: string | undefined;
    vi.spyOn(opStoreInternal, "linkCardsDirect").mockImplementation(
      async (...args: unknown[]) => {
        linkCalls += 1;
        if (linkCalls === 1) {
          firstChildId = args[1] as string;
          return await original.apply(opStore, args);
        }
        // A concurrent host write lands on the parent right as the second
        // child's link fails and aborts the whole decompose call.
        await hostStore.update(parent.id, { notes: "host note during decompose" });
        throw new Error("simulated mid-decompose failure");
      },
    );

    await expect(
      opStore.decompose(parent.id, {
        children: [{ title: "Child 1" }, { title: "Child 2" }],
      }),
    ).rejects.toThrow("simulated mid-decompose failure");

    const finalParent = await hostStore.get(parent.id);
    expect(finalParent?.notes).toBe("host note during decompose");
    // The (rolled-back) first child was a brand-new card, so cleanup deletes
    // it outright and its link on the parent goes with it.
    expect(finalParent?.metadata?.links ?? []).toHaveLength(0);
    expect(firstChildId).toBeDefined();
    expect(await hostStore.get(firstChildId!)).toBeUndefined();
  });
});

describe("linkCards compensation (需求/15.8-并发与补偿设计.md §4.4, 选做 -- confirmed reproducible)", () => {
  it("does not leave a one-sided link on the parent when the child's half of the write fails", async () => {
    const shared = keyedStore<PersistedTaskfoldCard>();
    const store = createStore(shared);
    const parent = await store.create({ title: "Parent" });
    const child = await store.create({ title: "Child" });

    type StoreWithUpdateCard = {
      updateCard: (...args: unknown[]) => Promise<unknown>;
    };
    const storeInternal = store as unknown as StoreWithUpdateCard;
    const original = storeInternal.updateCard.bind(store);
    let calls = 0;
    vi.spyOn(storeInternal, "updateCard").mockImplementation(async (...args: unknown[]) => {
      calls += 1;
      // The 1st updateCard() call inside linkCardsDirect() writes the parent's
      // half of the link; the 2nd writes the child's half. Failing the 2nd
      // (a stand-in for any transient write failure, e.g. a lost CAS race in
      // a real backend) reproduces exactly what 需求/15.8 §2.3 flagged:
      // linkCardsDirect() had no compensation, so without the fix below the
      // parent would keep a "child"-type link with no reciprocal on the child.
      if (calls === 2) {
        throw new Error("simulated transient write failure");
      }
      return await original(...args);
    });

    await expect(store.linkCards(parent.id, child.id)).rejects.toThrow(
      "simulated transient write failure",
    );

    const finalParent = await store.get(parent.id);
    const finalChild = await store.get(child.id);
    expect(finalParent?.metadata?.links ?? []).toHaveLength(0);
    expect(finalChild?.metadata?.links ?? []).toHaveLength(0);
  });
});
