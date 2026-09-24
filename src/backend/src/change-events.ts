import type { OpenClawPluginService } from "../api.js";
import type { TaskfoldStore } from "./store.js";

const TASKFOLD_EXTERNAL_CHANGE_CHECK_MS = 1000;

/** SQLite 生产路径传 TaskfoldStore；文件后端传 change-aggregator.ts 的聚合游标（轮询所有已注册项目）。 */
export type TaskfoldChangeEventTarget = Pick<TaskfoldStore, "announceChangeEpoch" | "reconcileExternalChanges">;

export function createTaskfoldChangeEventService(store: TaskfoldChangeEventTarget): OpenClawPluginService {
  let timer: ReturnType<typeof setInterval> | undefined;

  return {
    id: "taskfold-change-events",
    start(ctx) {
      if (timer) {
        return;
      }
      store.announceChangeEpoch();
      // Picks up writes committed by another process on the same database, which
      // an in-process listener cannot observe. Waiting clients are notified
      // through the change cursor they already long-wait on.
      // 这就是 core ChangeSource 的轮询驱动（需求/18 §3.3 第 6 行）：SQLite 看 `PRAGMA
      // data_version`，文件后端读各项目的 `.taskfold/.runtime/changes.log`。
      timer = setInterval(() => {
        try {
          store.reconcileExternalChanges();
        } catch (error) {
          ctx.logger.warn(`taskfold external change check failed: ${String(error)}`);
        }
      }, TASKFOLD_EXTERNAL_CHANGE_CHECK_MS);
      timer.unref?.();
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    },
  };
}
