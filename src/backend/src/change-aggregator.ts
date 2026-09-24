// Taskfold 适配层：`taskfold.changes.wait` 的跨项目聚合游标（TASK-4 定案「适配层聚合游标」，
// TASK-10 接进生产路径）。
//
// 文件后端下 core 的变更游标按项目：每个项目一份 `.taskfold/.runtime/changes.log`，各有各的
// epoch 与 revision，彼此不能比较。而前端（browser/project-host.ts 的 waitForChanges）调用
// `taskfold.changes.wait` 时不带项目，拿的是一个全局游标。这里把所有已打开的项目聚合成一个
// ChangeSource，交给组合 store（project-routed-stores.ts）上唯一的 TaskfoldStore：epoch 是本
// Gateway 进程自己的（每个进程一个，重启后前端整页刷新一次），revision 是单调计数，任一项目
// 前进一次（本进程写入，或轮询到别的进程写入 / 人手改文件 / 新出现的项目目录）就 +1。返回形状
// 与 TaskfoldStore.waitForChange 完全相同，前端零改动。
//
// 本进程写入时只在**写到的那些项目**的 changes.log 里记一笔（组合 store 写入时 markDirty）。
import { randomUUID } from "node:crypto";
import type { TaskfoldChange } from "@taskfold/core/contract/index.js";
import type { TaskfoldChangeSource } from "@taskfold/core/store-change-tracker.js";

export class TaskfoldAggregatedChangeSource implements TaskfoldChangeSource {
  private readonly epoch = randomUUID();
  private revision = 0;
  private readonly projects = new Set<TaskfoldChangeSource>();
  private readonly dirty = new Set<TaskfoldChangeSource>();
  private discovering = false;
  private discovered = false;

  /**
   * @param discover 找出新出现的项目目录并打开（组合 store 给出）；返回是否打开了新项目。
   *   poll 是同步契约，这里只把它发起、不等它：新项目在下一次 poll 时算作一次变化。
   */
  constructor(private readonly discover?: () => Promise<boolean>, private readonly warn?: (message: string) => void) {}

  addProject(source: TaskfoldChangeSource): void {
    this.projects.add(source);
  }

  /** 本进程刚往这个项目写过：下一次 record() 在它的 changes.log 里记一笔。 */
  markDirty(source: TaskfoldChangeSource): void {
    this.dirty.add(source);
  }

  announce(): TaskfoldChange {
    this.startDiscovery();
    return this.next();
  }

  async record(): Promise<TaskfoldChange> {
    const dirty = [...this.dirty];
    this.dirty.clear();
    for (const source of dirty) {
      await source.record();
    }
    return this.next();
  }

  poll(): TaskfoldChange | undefined {
    let changed = this.discovered;
    this.discovered = false;
    for (const source of this.projects) {
      changed = source.poll() !== undefined || changed;
    }
    this.startDiscovery();
    return changed ? this.next() : undefined;
  }

  private startDiscovery(): void {
    if (!this.discover || this.discovering) {
      return;
    }
    this.discovering = true;
    this.discover().then(
      (found) => {
        this.discovering = false;
        this.discovered ||= found;
      },
      (error: unknown) => {
        this.discovering = false;
        this.warn?.(`taskfold: project discovery failed: ${String(error)}`);
      },
    );
  }

  private next(): TaskfoldChange {
    this.revision += 1;
    return { epoch: this.epoch, revision: this.revision };
  }
}
