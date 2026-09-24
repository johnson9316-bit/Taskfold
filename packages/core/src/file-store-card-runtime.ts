// Taskfold plugin module: 卡片运行态文件（需求/18 §3.7）。
//
// 机器高频改写的字段不进入 Git 跟踪的卡片 md，改放 `<dataDir>/.runtime/cards/<id>.json`
// （`.runtime/` 由 `<dataDir>/.gitignore` 忽略）。同一个文件里还存：
//   - `revision`：整数，16 R3 的「存储的、每次写 +1」计数器，不再写进 md；
//   - `contentHash`：上次盖 revision 时卡片 md 文件完整内容的 hash。拿到卡锁后重算，
//     与之不一致就说明 md 被外部改过（人手编辑、`git checkout`/`pull`），先 revision +1
//     再做 CAS——持旧 revision 的写入方因此被判冲突。
//
// md 与运行态 JSON 共用同一把卡锁（file-store-locks.ts），逻辑上是一个 revision。
// 写入顺序固定为「先 md、后运行态」：写完 md 崩溃，下次读到的 hash 对不上，只会被当作
// 一次外部修改、revision 多加 1，是安全的方向。
import { createHash } from "node:crypto";
import path from "node:path";
import type { TaskfoldCard, TaskfoldClaim, TaskfoldEvent, TaskfoldExecution } from "./contract/index.js";
import { readFileIfExists, removeFileIfExists, writeFileAtomic } from "./file-store-atomic.js";
import { nextTaskfoldCardRevision, TASKFOLD_INITIAL_CARD_REVISION } from "./store-constants.js";

/** 移出 md 的顶层字段。`metadata.claim` 单独处理（它嵌在 metadata 里）。 */
const TOP_LEVEL_RUNTIME_FIELDS = ["sessionKey", "runId", "taskId", "execution", "events"] as const;

/** 运行态字段本身。键缺失表示字段缺失（R6：与 `null` 区分，JSON 原样保留）。 */
export type TaskfoldCardRuntimeFields = {
  sessionKey?: string;
  runId?: string;
  taskId?: string;
  execution?: TaskfoldExecution;
  events?: TaskfoldEvent[];
  claim?: TaskfoldClaim;
};

export type TaskfoldCardRuntime = {
  version: 1;
  revision: number;
  contentHash: string;
  /** 最后一次经 store 写入的时间。只改运行态字段的写入不改写 md（md 的 updated_date 不动），
   * 读取时 `updatedAt` 取 md 与这里两者较大者。从 md 初始化的运行态没有这个值。 */
  updatedAt?: number;
  fields: TaskfoldCardRuntimeFields;
};

export function cardRuntimePath(runtimeCardsDir: string, cardKey: string): string {
  return path.join(runtimeCardsDir, `${encodeURIComponent(cardKey)}.json`);
}

export function hashCardFileContent(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

/** 读运行态文件；不存在或内容无法识别时返回 undefined（按「运行态丢失」处理）。 */
export function readCardRuntime(filePath: string): TaskfoldCardRuntime | undefined {
  const content = readFileIfExists(filePath);
  if (content === undefined) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(content) as Partial<TaskfoldCardRuntime>;
    if (
      parsed?.version !== 1 ||
      !Number.isSafeInteger(parsed.revision) ||
      typeof parsed.contentHash !== "string" ||
      typeof parsed.fields !== "object" ||
      parsed.fields === null
    ) {
      return undefined;
    }
    return parsed as TaskfoldCardRuntime;
  } catch {
    return undefined;
  }
}

export function writeCardRuntime(filePath: string, runtime: TaskfoldCardRuntime, beforeRename?: () => void): void {
  writeFileAtomic(filePath, `${JSON.stringify(runtime, null, 2)}\n`, undefined, beforeRename);
}

export function removeCardRuntime(filePath: string): void {
  removeFileIfExists(filePath);
}

/** 从整卡里拆出运行态字段，返回「写进 md 的卡」与运行态字段。不修改入参。
 * 返回的 md 卡不带 `revision`（JSON 序列化时省略该键），类型上仍按 TaskfoldCard 交给 codec。 */
export function splitCardRuntime(card: TaskfoldCard): { mdCard: TaskfoldCard; fields: TaskfoldCardRuntimeFields } {
  const mdCard: Record<string, unknown> = { ...card };
  const fields: Record<string, unknown> = {};
  delete mdCard.revision;
  for (const key of TOP_LEVEL_RUNTIME_FIELDS) {
    if (key in mdCard) {
      if (mdCard[key] !== undefined) {
        fields[key] = mdCard[key];
      }
      delete mdCard[key];
    }
  }
  if (card.metadata && "claim" in card.metadata) {
    const { claim, ...metadata } = card.metadata;
    if (claim !== undefined) {
      fields.claim = claim;
    }
    if (Object.keys(metadata).length > 0) {
      mdCard.metadata = metadata;
    } else {
      delete mdCard.metadata;
    }
  }
  return { mdCard: mdCard as TaskfoldCard, fields: fields as TaskfoldCardRuntimeFields };
}

/** 把 md 解析出的卡与运行态字段合并成上层看到的整卡。
 * 运行态文件存在时它是运行态字段的唯一来源（md 里残留的旧格式字段一律忽略）；
 * 不存在时沿用 md 里的旧格式字段（兼容尚未迁出的旧数据）。 */
export function mergeCardRuntime(
  parsed: TaskfoldCard,
  runtime: TaskfoldCardRuntime | undefined,
  revision: number,
): TaskfoldCard {
  if (!runtime) {
    return { ...parsed, revision };
  }
  const { mdCard } = splitCardRuntime(parsed);
  const card: TaskfoldCard = { ...mdCard, revision, updatedAt: Math.max(mdCard.updatedAt, runtime.updatedAt ?? 0) };
  const { claim, ...topLevel } = runtime.fields;
  Object.assign(card, topLevel);
  if ("claim" in runtime.fields) {
    card.metadata = { ...card.metadata, claim };
  }
  return card;
}

/**
 * 当前应当生效的运行态（纯计算，不落盘）：
 *   - 运行态文件缺失：按当前 md 初始化——旧格式 md（带 revision r）保守取 r + 1：md 可能在
 *     运行态缺失期间被外部改过，而这无从检测，+1 让持 r 的写入方一律被判冲突；新格式 md
 *     （不带 revision）取 1。hash 取当前内容；运行态字段取 md 里的旧格式字段。
 *   - hash 与当前 md 内容不一致：md 被外部改过，revision +1、hash 更新。
 * `changed` 为 true 表示结果与磁盘上的运行态文件不同，持锁的调用方应把它写回。
 */
export function resolveCardRuntime(
  mdContent: string,
  parsed: TaskfoldCard,
  stored: TaskfoldCardRuntime | undefined,
): { runtime: TaskfoldCardRuntime; changed: boolean; external: boolean } {
  const contentHash = hashCardFileContent(mdContent);
  if (!stored) {
    const legacyRevision =
      Number.isSafeInteger(parsed.revision) && parsed.revision > 0
        ? nextTaskfoldCardRevision(parsed.revision)
        : TASKFOLD_INITIAL_CARD_REVISION;
    return {
      runtime: { version: 1, revision: legacyRevision, contentHash, fields: splitCardRuntime(parsed).fields },
      changed: true,
      external: true,
    };
  }
  if (stored.contentHash !== contentHash) {
    return {
      runtime: { ...stored, revision: nextTaskfoldCardRevision(stored.revision), contentHash },
      changed: true,
      external: true,
    };
  }
  return { runtime: stored, changed: false, external: false };
}
