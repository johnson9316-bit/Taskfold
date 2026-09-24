// Taskfold plugin module derives Taskfold session identity and matches it
// against host-reported session keys / runIds that do not always agree with
// what the card itself stored. Isomorphic port of `session-link.ts` from the
// extension this codebase was adapted from (see UPSTREAM.md; exact source
// location cited in 需求/15.7-会话生命周期设计.md §2.6), adapted to Taskfold's
// own provisional-runId convention (需求/15.7 §5 边⑤/⑪, §7 步骤 5).
import type { TaskfoldCard } from "./contract/index.js";
import { cardBoardId, cardRunId, cardSessionKey } from "./store-card-helpers.js";

function sanitizeSessionSegment(value: string | undefined, fallback: string): string {
  const sanitized = (value ?? fallback)
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (sanitized || fallback).slice(0, 96);
}

/** Session key the host would assign this card if dispatched right now. */
export function buildSessionKey(card: TaskfoldCard): string {
  const boardId = sanitizeSessionSegment(cardBoardId(card), "default");
  const cardId = sanitizeSessionSegment(card.id, "card");
  const suffix = `subagent:taskfold-${boardId}-${cardId}`;
  return card.agentId ? `agent:${sanitizeSessionSegment(card.agentId, "agent")}:${suffix}` : suffix;
}

/**
 * Strips a leading `agent:<id>:` scope, if present, from a session key.
 * `sessions.list`/hook payloads report agent-scoped keys (`agent:main:
 * subagent:…`) even for a card with no explicit `agentId`, which stores the
 * unscoped tail (`subagent:…`) instead — the host resolves either form to the
 * same session, but a literal string comparison between them never matches
 * (需求/15.7 §2.6). The previous version of this matching logic made exactly
 * that literal comparison, so "the host has no session for this card" held
 * for every card and the startup sweep force-failed every live run (`b7abc5c`
 * 第 5 条 regression; [[VERIFICATION]]).
 */
export function taskfoldCardSessionLookupKey(sessionKey: string | undefined): string | undefined {
  if (!sessionKey) {
    return undefined;
  }
  const match = /^agent:[^:]+:(.+)$/.exec(sessionKey);
  return match ? match[1] : sessionKey;
}

/**
 * Whether `runId` is still the temporary placeholder `openExecutionLaunch`
 * mints for `cardId` (需求/15.7 §5 边①, `taskfold:<cardId>:<claimToken>`), or
 * absent — i.e. the card has not durably recorded a host-issued runId.
 */
function isProvisionalOrAbsentRunId(runId: string | undefined, cardId: string): boolean {
  return runId === undefined || runId.startsWith(`taskfold:${cardId}:`);
}

/**
 * Whether a host-reported run/session identity refers to `card`. An exact
 * `runId` match always wins. Otherwise, when the card's own runId is absent
 * or still `openExecutionLaunch`'s provisional placeholder — i.e. this card
 * never durably recorded the host's real runId, most often because a Gateway
 * restart landed between `prepared` and `accepted` — the match falls back to
 * `target.sessionKey`, normalized through {@link taskfoldCardSessionLookupKey}
 * so an agent-scoped host key still matches an unscoped card key or vice
 * versa. A card already holding a *different*, real host-issued runId is
 * never matched by session key alone: that would let a stale event from a run
 * this card has already moved past resolve against the card's current run
 * (需求/15.7 §7 步骤 5 — 匹配放宽一旦过宽就是串卡, 防 `b7abc5c` 第 5 条回归).
 */
export function taskfoldCardMatchesLifecycleLink(
  card: TaskfoldCard,
  target: { runId?: string; sessionKey?: string },
): boolean {
  const runId = cardRunId(card);
  if (target.runId && runId === target.runId) {
    return true;
  }
  if (target.runId && !isProvisionalOrAbsentRunId(runId, card.id)) {
    return false;
  }
  const cardKey = taskfoldCardSessionLookupKey(cardSessionKey(card));
  const targetKey = taskfoldCardSessionLookupKey(target.sessionKey);
  return Boolean(cardKey && targetKey && cardKey === targetKey);
}
