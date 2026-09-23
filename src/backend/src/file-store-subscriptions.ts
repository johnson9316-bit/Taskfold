// Taskfold plugin module: the file-backed `subscriptions` KeyedStore
// (`~/.openclaw/plugins/taskfold/subscriptions/<id>.json`, 需求/16 第六节). Lives in the
// plugin directory, not the project repo, for the same reason runs/metrics do: a
// subscription is host-side bookkeeping, not project data that should follow a git
// branch. No CAS, matching sqlite-store.ts's TaskfoldSqliteSubscriptionStore.
import path from "node:path";
import type { TaskfoldNotificationSubscription } from "../../contract/index.js";
import type { PersistedTaskfoldNotificationSubscription, TaskfoldKeyedStore } from "./persistence-types.js";
import { listFileNamesSafe, readFileIfExists, removeFileIfExists, writeFileAtomic } from "./file-store-atomic.js";

const SUBSCRIPTION_EXTENSION = ".json";

function assertValidSubscriptionPayload(
  key: string,
  value: PersistedTaskfoldNotificationSubscription,
): void {
  if (value.version !== 1 || value.subscription.id !== key) {
    throw new Error("invalid taskfold notification subscription payload");
  }
}

function subscriptionFilePath(subscriptionsDir: string, id: string): string {
  return path.join(subscriptionsDir, `${id}${SUBSCRIPTION_EXTENSION}`);
}

export function createTaskfoldFileSubscriptionStore(options: {
  subscriptionsDir: string;
}): TaskfoldKeyedStore<PersistedTaskfoldNotificationSubscription> {
  const { subscriptionsDir } = options;

  return {
    async register(key, value) {
      assertValidSubscriptionPayload(key, value);
      writeFileAtomic(
        subscriptionFilePath(subscriptionsDir, key),
        JSON.stringify(value.subscription, null, 2),
      );
    },

    async lookup(key) {
      const content = readFileIfExists(subscriptionFilePath(subscriptionsDir, key));
      return content === undefined
        ? undefined
        : { version: 1, subscription: JSON.parse(content) as TaskfoldNotificationSubscription };
    },

    async delete(key) {
      return removeFileIfExists(subscriptionFilePath(subscriptionsDir, key));
    },

    async entries() {
      const results: Array<{ key: string; value: PersistedTaskfoldNotificationSubscription }> = [];
      for (const fileName of listFileNamesSafe(subscriptionsDir)) {
        if (!fileName.endsWith(SUBSCRIPTION_EXTENSION)) {
          continue;
        }
        const content = readFileIfExists(path.join(subscriptionsDir, fileName));
        if (content !== undefined) {
          const subscription = JSON.parse(content) as TaskfoldNotificationSubscription;
          results.push({ key: subscription.id, value: { version: 1, subscription } });
        }
      }
      return results;
    },
  };
}
