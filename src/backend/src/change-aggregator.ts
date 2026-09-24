// Taskfold 适配层：`taskfold.changes.wait` 的跨项目聚合游标（TASK-4 定案「适配层聚合游标」）。
//
// 文件后端下 core 的变更游标按项目：每个项目一份 `.taskfold/.runtime/changes.log`，各有各的
// epoch 与 revision，彼此不能比较。而前端（browser/project-host.ts 的 waitForChanges）调用
// `taskfold.changes.wait` 时不带项目，拿的是一个全局游标。这里把所有已注册项目聚合成一个
// 游标：epoch 是本 Gateway 进程自己的（每个进程一个，重启后前端整页刷新一次），revision 是
// 单调计数，任一项目的游标前进一次（本进程写入，或轮询到别的进程写入 / 人手改文件）就 +1。
// 返回形状与 TaskfoldStore.waitForChange 完全相同，前端零改动。
//
// 只用于文件后端。SQLite 生产路径所有项目在同一个库里，本来就只有一个游标，不经过这里
// （gateway.ts 不传 `changes` 时直接用 store 自己的游标）。
import type { TaskfoldChange } from "@taskfold/core/contract/index.js";
import { TaskfoldChangeTracker } from "@taskfold/core/store-change-tracker.js";

/** 一个项目的变更来源：按项目打开的 core store（TaskfoldStore 天然满足）。 */
export type TaskfoldProjectChangeFeed = {
  subscribeChanges(listener: (change: TaskfoldChange) => void): () => void;
  reconcileExternalChanges(): boolean;
};

export class TaskfoldAggregatedChangeCursor {
  // 默认 ChangeSource：进程级随机 epoch + 内存单调计数，不落盘。
  private readonly tracker = new TaskfoldChangeTracker();
  private readonly projects = new Map<TaskfoldProjectChangeFeed, () => void>();

  /** 注册一个项目；返回的函数注销它。同一个 feed 重复注册只算一次。 */
  addProject(feed: TaskfoldProjectChangeFeed): () => void {
    if (!this.projects.has(feed)) {
      this.projects.set(
        feed,
        feed.subscribeChanges(() => this.tracker.recordChange()),
      );
    }
    return () => {
      this.projects.get(feed)?.();
      this.projects.delete(feed);
    };
  }

  announceChangeEpoch(): void {
    this.tracker.announceEpoch();
  }

  /** change-events.ts 每秒调一次：轮询每个项目的 ChangeSource，前进的项目经订阅让聚合游标 +1。 */
  reconcileExternalChanges(): boolean {
    let changed = false;
    for (const feed of this.projects.keys()) {
      changed = feed.reconcileExternalChanges() || changed;
    }
    return changed;
  }

  currentChange(): TaskfoldChange | undefined {
    return this.tracker.current();
  }

  async waitForChange(
    after: TaskfoldChange | undefined,
    timeoutMs: number,
  ): Promise<{ change?: TaskfoldChange; timedOut: boolean }> {
    return await this.tracker.waitForChange(after, timeoutMs);
  }
}
