// 卡片的读写与 `--json` 视图。只用 core 的卡片增删改查与状态流转，不碰执行
// （claim / dispatch / launch 等，需求/18 §3.2）。
import { resolveTaskfoldCardByIdOrPrefix } from "@taskfold/core/card-lookup.js";
import type { TaskfoldCard } from "@taskfold/core/contract/index.js";
import { cardBoardId } from "@taskfold/core/store-card-helpers.js";
import { TaskfoldRevisionConflictError } from "@taskfold/core/store-core.js";
import type { TaskfoldCardPatch } from "@taskfold/core/store-inputs.js";
import type { TaskfoldProjectStore } from "@taskfold/core/store-projects.js";
import { TaskfoldCliError, toCliError } from "./errors.js";

/** 卡片在 `--json` 输出里的形状（`card-list` 的每一项）。字段集合是契约的一部分：缺省值用
 * `null`/`[]`/`false`，不省略键。 */
export type TaskfoldCliCardSummary = {
  id: string;
  shortId: string;
  title: string;
  status: string;
  priority: string;
  labels: string[];
  agentId: string | null;
  boardId: string;
  milestoneId: string | null;
  archived: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

/** `card` 输出（show / create / update）：summary 再加正文。 */
export type TaskfoldCliCardDetail = TaskfoldCliCardSummary & { notes: string };

export const SHORT_ID_LENGTH = 8;

function isoTime(epochMs: number): string {
  return Number.isFinite(epochMs) ? new Date(epochMs).toISOString() : new Date(0).toISOString();
}

export function toCardSummary(card: TaskfoldCard): TaskfoldCliCardSummary {
  return {
    id: card.id,
    shortId: card.id.slice(0, SHORT_ID_LENGTH),
    title: card.title,
    status: card.status,
    priority: card.priority,
    labels: [...card.labels],
    agentId: card.agentId ?? null,
    boardId: cardBoardId(card),
    milestoneId: card.milestoneId ?? null,
    archived: Boolean(card.metadata?.archivedAt),
    revision: card.revision,
    createdAt: isoTime(card.createdAt),
    updatedAt: isoTime(card.updatedAt),
  };
}

export function toCardDetail(card: TaskfoldCard): TaskfoldCliCardDetail {
  return { ...toCardSummary(card), notes: card.notes ?? "" };
}

/** 完整 id 或唯一前缀 → 卡片；不存在 NOT_FOUND，前缀命中多张 AMBIGUOUS。 */
export async function resolveCard(store: TaskfoldProjectStore, idOrPrefix: string): Promise<TaskfoldCard> {
  const query = idOrPrefix.trim();
  if (!query) {
    throw new TaskfoldCliError("INVALID_ARGUMENT", "card id must not be empty.");
  }
  const exact = await store.get(query);
  if (exact) {
    return exact;
  }
  const cards = await store.list();
  const { card, error } = resolveTaskfoldCardByIdOrPrefix(cards, query);
  if (card) {
    return card;
  }
  const matches = cards.filter((candidate) => candidate.id.startsWith(query));
  if (matches.length > 1) {
    throw new TaskfoldCliError("AMBIGUOUS", error, { id: query, matches: matches.map((match) => match.id) });
  }
  throw new TaskfoldCliError("NOT_FOUND", `card not found: ${query}`, { id: query });
}

/** 仓库里有卡片的 board（去重、排序）。 */
export function boardsInUse(cards: readonly TaskfoldCard[]): string[] {
  return [...new Set(cards.map((card) => cardBoardId(card)))].toSorted();
}

/**
 * 新建卡片时没给 `--board` 用哪个 board：仓库里还没有卡片 → `default`；所有卡片都在同一个
 * board → 那个 board（例如 OpenClaw 按项目 id 建的卡）；卡片分属多个 board → 不猜，AMBIGUOUS。
 * 返回 `undefined` 表示有歧义。
 */
export function defaultBoardFor(cards: readonly TaskfoldCard[]): string | undefined {
  const boards = boardsInUse(cards);
  if (boards.length === 0) {
    return "default";
  }
  return boards.length === 1 ? boards[0] : undefined;
}

export async function resolveCreateBoard(
  store: TaskfoldProjectStore,
  requested: string | undefined,
): Promise<string> {
  if (requested !== undefined) {
    return requested;
  }
  const cards = await store.list();
  const board = defaultBoardFor(cards);
  if (board === undefined) {
    const boards = boardsInUse(cards);
    throw new TaskfoldCliError(
      "AMBIGUOUS",
      `this repository has cards on several boards (${boards.join(", ")}); pass --board <id>.`,
      { boards },
    );
  }
  return board;
}

/** 字段级增量更新时，revision 冲突最多重试几次（每次都重读卡片、在最新版本上重算 patch）。 */
const FIELD_UPDATE_MAX_ATTEMPTS = 3;

/**
 * 按 `buildPatch(最新的卡)` 更新一张卡，始终走 core 的 CAS（`expectedRevision`）。
 *
 * - 没给 `expectRevision`（字段级增量）：用刚读到的 revision 做 CAS；输给并发写入就重读、在新版本
 *   上重算 patch 再试（最多 {@link FIELD_UPDATE_MAX_ATTEMPTS} 次），别的进程改的字段不会被
 *   覆盖掉。锁失效（compromised）同样重试——那次写入已放弃，重读后重做是安全的。
 * - 给了 `expectRevision`（整体替换正文，或调用方要求严格校验）：只认这一个 revision，不重试。
 * - 等锁超时不重试：core 已经等过约 2 秒（需求/18 §3.4），直接报 LOCKED。
 */
export async function updateCardWithRetry(
  store: TaskfoldProjectStore,
  cardId: string,
  buildPatch: (card: TaskfoldCard) => TaskfoldCardPatch,
  expectRevision?: number,
): Promise<TaskfoldCard> {
  for (let attempt = 1; ; attempt += 1) {
    const current = await store.get(cardId);
    if (!current) {
      throw new TaskfoldCliError("NOT_FOUND", `card not found: ${cardId}`, { id: cardId });
    }
    const expectedRevision = expectRevision ?? current.revision;
    try {
      return await store.update(cardId, buildPatch(current), { expectedRevision });
    } catch (error) {
      if (!(error instanceof TaskfoldRevisionConflictError)) {
        throw error;
      }
      const retriable =
        expectRevision === undefined &&
        (error.reason === "revision" || error.reason === "lock-compromised") &&
        attempt < FIELD_UPDATE_MAX_ATTEMPTS;
      if (retriable) {
        continue;
      }
      const cliError = toCliError(error);
      if (cliError.code === "CONFLICT") {
        const latest = await store.get(cardId);
        throw new TaskfoldCliError(cliError.code, cliError.message, {
          ...cliError.details,
          currentRevision: latest?.revision ?? null,
        });
      }
      throw cliError;
    }
  }
}
