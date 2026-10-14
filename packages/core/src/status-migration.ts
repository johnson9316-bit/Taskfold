// Taskfold core：状态模型迁移的计划（需求/22-状态模型 第 3 步）。纯函数，无 IO。
//
// 迁移做两件事：
//   1. 把项目的状态集写进 `.taskfold/config.yml` 的 `statuses`（并把格式版本升到 4）。没配置过的项目
//      生成默认 5 个状态；旧项目里实际有卡在用的 `triage` / `backlog` 一并登记，不丢。
//   2. 把磁盘上已退役的内部状态换成新表示：ready → 待办 + 派发标记，scheduled → 待办，
//      blocked → 进行中 + 阻塞标记。
//
// 读取侧不需要等迁移：{@link cardPhase} 一直按旧含义解释旧值。迁移只是把文件整理干净，并把旧版
// core 挡进只读模式。
import type { TaskfoldCard, TaskfoldStatus, TaskfoldStatusDefinition } from "./contract/index.js";
import { cardPhase, phasePatch, type TaskfoldPhaseFlags } from "./card-phase.js";
import {
  createStatusRegistry,
  isRetiredTaskfoldStatusId,
  validateStatusDefinitions,
  type TaskfoldRetiredStatusId,
  type TaskfoldStatusRegistry,
} from "./status-registry.js";

export type TaskfoldStatusMigrationRewrite = {
  cardId: string;
  from: TaskfoldRetiredStatusId;
  to: TaskfoldStatus;
};

export type TaskfoldStatusMigrationPlan = {
  /** 迁移后项目生效的状态集。 */
  statuses: TaskfoldStatusDefinition[];
  /** 状态集是否需要写进 config.yml（项目还没有配置）。 */
  writeStatuses: boolean;
  /** 需要把退役状态换成新表示的卡。 */
  rewrites: TaskfoldStatusMigrationRewrite[];
  /** 按状态 id 统计的卡片数（迁移前）。 */
  usage: Record<string, number>;
  /** 在用、却既不在状态集里也不是退役状态的 id：无法迁移，必须人工处理。 */
  orphans: string[];
};

export type TaskfoldStatusMigrationReport = {
  boardId: string;
  dryRun: boolean;
  /** 本次是否改动了数据（dry-run 与"已经迁移过"都是 false）。 */
  changed: boolean;
  statuses: TaskfoldStatusDefinition[];
  wroteStatuses: boolean;
  total: number;
  usage: Record<string, number>;
  rewrites: TaskfoldStatusMigrationRewrite[];
  /** 迁移前的备份目录；没有改动、dry-run 或后端不支持备份时为 undefined。 */
  backupDir?: string;
  /** 重写时输给并发写入的卡：重跑一次迁移即可补上。 */
  conflicts: string[];
};

/** 没配置过 `statuses` 的项目迁移后得到的状态集：默认 5 个，加上实际在用的 triage / backlog。 */
export function defaultMigratedStatuses(usage: Readonly<Record<string, number>>): TaskfoldStatusDefinition[] {
  const used = (id: string) => (usage[id] ?? 0) > 0;
  return validateStatusDefinitions([
    ...(used("triage") ? [{ id: "triage", category: "unstarted", role: "intake" }] : []),
    ...(used("backlog") ? [{ id: "backlog", category: "unstarted" }] : []),
    // 显式标默认：triage / backlog 排在前面时，新卡仍然落在待办。
    { id: "todo", category: "unstarted", default: true },
    { id: "running", category: "started" },
    { id: "review", category: "started", role: "review" },
    { id: "done", category: "completed" },
    { id: "cancelled", category: "cancelled" },
  ]);
}

export function planStatusMigration(
  cards: readonly TaskfoldCard[],
  configured: readonly TaskfoldStatusDefinition[] | undefined,
): TaskfoldStatusMigrationPlan {
  const usage: Record<string, number> = {};
  for (const card of cards) {
    usage[card.status] = (usage[card.status] ?? 0) + 1;
  }
  const statuses = configured ? [...configured] : defaultMigratedStatuses(usage);
  const known = new Set(statuses.map((status) => status.id));
  const registry = createStatusRegistry(statuses);
  const rewrites: TaskfoldStatusMigrationRewrite[] = [];
  const orphans = new Set<string>();
  for (const card of cards) {
    if (isRetiredTaskfoldStatusId(card.status)) {
      // 退役状态不在新状态集里时才需要换；用户若自己把 `ready` 配成了状态，就不动它。
      if (!known.has(card.status)) {
        rewrites.push({ cardId: card.id, from: card.status, to: migratedStatusFor(card, registry) });
      }
    } else if (!known.has(card.status)) {
      orphans.add(card.status);
    }
  }
  return { statuses, writeStatuses: configured === undefined, rewrites, usage, orphans: [...orphans].sort() };
}

function migratedStatusFor(card: TaskfoldCard, registry: TaskfoldStatusRegistry): TaskfoldStatus {
  return rewriteForMigration(card, registry).status;
}

/** 一张退役状态的卡在新状态集里应该写成什么（保持 updatedAt 不变，不记历史事件）。 */
export function rewriteForMigration(
  card: TaskfoldCard,
  registry: TaskfoldStatusRegistry,
): { status: TaskfoldStatus; flags: TaskfoldPhaseFlags } {
  // 旧状态按旧含义归类，再翻译成新表示。blocked 的时间取卡最后一次更新（它最接近被阻塞的时刻）。
  const phase = cardPhase(card, registry, card.updatedAt);
  return phasePatch(card, phase, registry, { now: card.updatedAt });
}
