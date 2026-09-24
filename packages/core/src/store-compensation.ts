import { isDeepStrictEqual } from "node:util";
import type { TaskfoldCard } from "./contract/index.js";
import { isRecord } from "./sdk-utils.js";

/**
 * Pure three-way-merge compensation layer, ported from the extension this
 * codebase was adapted from (see UPSTREAM.md). Everything below this comment
 * is a data transform: no store, no persistence, no I/O, no knowledge of
 * SQLite or `compareAndSwap`. It only knows how to compute "undo the edit
 * from `before` to `after`, but keep whatever a third party did to `current`
 * in the meantime."
 *
 * This boundary is deliberate: the project has a separate, still-undecided
 * plan (需求/16-文件存储改造.md) to replace the SQLite backend with a
 * Markdown-file backend. When that lands, only the compare-and-swap retry
 * loop that calls these functions (`TaskfoldCoreStore.compensateWorkspaceMutation`
 * and its sibling in store-workflow.ts's `decompose`) needs to change to match
 * the new persistence primitives. These functions should not need to change
 * at all. Do not add a store dependency, an `await`, or a persistence
 * assumption here -- that would defeat the point of keeping this file pure.
 */

const ABSENT = Symbol("taskfold-compensation-absent");

function recordValue(record: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(record, key) && record[key] !== undefined ? record[key] : ABSENT;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, canonicalValue(entry)]),
  );
}

function sameValue(left: unknown, right: unknown): boolean {
  return isDeepStrictEqual(canonicalValue(left), canonicalValue(right));
}

function stableId(value: unknown): string | undefined {
  return isRecord(value) && typeof value.id === "string" ? value.id : undefined;
}

function hasOnlyStableIds(values: unknown[]): boolean {
  return values.every((value) => stableId(value) !== undefined);
}

function insertRestoredValues(
  current: unknown[],
  restored: unknown[],
  reference: unknown[],
): unknown[] {
  const result = [...current];
  for (const value of restored.toReversed()) {
    const referenceIndex = reference.findIndex((entry) => stableId(entry) === stableId(value));
    const nextId = reference
      .slice(referenceIndex + 1)
      .map(stableId)
      .find((id) => id !== undefined && result.some((entry) => stableId(entry) === id));
    const nextIndex = nextId ? result.findIndex((entry) => stableId(entry) === nextId) : -1;
    result.splice(nextIndex >= 0 ? nextIndex : result.length, 0, value);
  }
  return result;
}

function rollbackStableIdArray(before: unknown[], after: unknown[], current: unknown[]): unknown[] {
  const beforeById = new Map(before.map((value) => [stableId(value)!, value]));
  const afterById = new Map(after.map((value) => [stableId(value)!, value]));
  const currentIds = new Set(current.map((value) => stableId(value)!));
  const merged = current.flatMap((currentValue) => {
    const id = stableId(currentValue)!;
    const beforeValue = beforeById.get(id);
    const afterValue = afterById.get(id);
    if (beforeValue === undefined && afterValue !== undefined) {
      return sameValue(currentValue, afterValue) ? [] : [currentValue];
    }
    if (beforeValue !== undefined && afterValue !== undefined) {
      const value = rollbackValue(beforeValue, afterValue, currentValue);
      return value === ABSENT ? [] : [value];
    }
    return [currentValue];
  });
  const restored = before.filter((value) => {
    const id = stableId(value)!;
    return !afterById.has(id) && !currentIds.has(id);
  });
  return insertRestoredValues(merged, restored, before);
}

function rollbackRecord(
  before: unknown,
  after: unknown,
  current: Record<string, unknown>,
): unknown {
  const beforeRecord = isRecord(before) ? before : {};
  const afterRecord = isRecord(after) ? after : {};
  const keys = new Set([
    ...Object.keys(beforeRecord),
    ...Object.keys(afterRecord),
    ...Object.keys(current),
  ]);
  const merged: Record<string, unknown> = {};
  for (const key of keys) {
    const value = rollbackValue(
      recordValue(beforeRecord, key),
      recordValue(afterRecord, key),
      recordValue(current, key),
    );
    if (value !== ABSENT) {
      merged[key] = value;
    }
  }
  return before === ABSENT && Object.keys(merged).length === 0 ? ABSENT : merged;
}

/**
 * Core three-way merge. `before`/`after` bracket one committed mutation this
 * caller wants to undo; `current` is the latest state, which may carry edits
 * from someone else made after `after` was captured. Only fields the bracketed
 * mutation actually touched are reverted; anything else in `current` survives
 * untouched.
 *
 * `hasOnlyStableIds` below has an implicit contract worth calling out: when an
 * array mixes stable-id records with anything else (or is empty on all three
 * sides in a way that can't be keyed), this function gives up on that field
 * and returns `current` as-is -- silently, not an error. For
 * `TaskfoldMetadata` that means `diagnostics` (keyed by `kind`, not `id`) and
 * `labels` (plain strings) never get rolled back by this merge. That is
 * accepted, not a bug: `diagnostics` is derived and recomputed every dispatch
 * pass, so leaving it alone is harmless, and `labels` losing rollback
 * coverage is a tolerable gap (see the pinning test in
 * test/store-compensation.test.ts).
 */
function rollbackValue(before: unknown, after: unknown, current: unknown): unknown {
  if (sameValue(before, after)) {
    return current;
  }
  if (sameValue(current, after)) {
    return before;
  }
  if (current === ABSENT) {
    return ABSENT;
  }
  if (
    Array.isArray(current) &&
    (Array.isArray(before) || before === ABSENT) &&
    (Array.isArray(after) || after === ABSENT)
  ) {
    const beforeArray = Array.isArray(before) ? before : [];
    const afterArray = Array.isArray(after) ? after : [];
    return hasOnlyStableIds([...beforeArray, ...afterArray, ...current])
      ? rollbackStableIdArray(beforeArray, afterArray, current)
      : current;
  }
  if (
    isRecord(current) &&
    (isRecord(before) || before === ABSENT) &&
    (isRecord(after) || after === ABSENT)
  ) {
    return rollbackRecord(before, after, current);
  }
  return current;
}

/**
 * Inverts a single card mutation (`before` -> `after`) against the latest
 * persisted state (`current`), preserving any concurrent edit `current` picked
 * up that `after` does not account for.
 */
export function invertTaskfoldCardMutation(
  before: TaskfoldCard,
  after: TaskfoldCard,
  current: TaskfoldCard,
): TaskfoldCard {
  const merged = rollbackValue(before, after, current);
  if (!isRecord(merged)) {
    throw new Error("taskfold card compensation produced an invalid card");
  }
  // SAFETY: recursive rollback starts from three valid card states. `id` never
  // differs across them; `revision` is the optimistic-concurrency token and is
  // about to be re-stamped by the persistence boundary regardless -- both are
  // pinned here for type completeness and to make the identity/CAS-token
  // invariant explicit rather than relying on rollbackValue's generic
  // scalar fallback.
  return { ...merged, id: current.id, revision: current.revision } as TaskfoldCard;
}

/**
 * True when `left` and `right` describe the same card state modulo the two
 * fields every write always advances (`updatedAt`, `revision`). Excluding
 * only `updatedAt` -- as the extension this codebase was adapted from does --
 * would make this always return false here: Taskfold's persistence boundary
 * bumps `revision` on every write (see store-core.ts's `stampCardRevisions`),
 * so two otherwise-identical cards a write apart always differ on `revision`
 * too, and a caller relying on this to short-circuit a compare-and-swap retry
 * loop would spin through every attempt and throw every time.
 */
export function sameTaskfoldCardState(left: TaskfoldCard, right: TaskfoldCard): boolean {
  const { updatedAt: _leftUpdatedAt, revision: _leftRevision, ...leftState } = left;
  const { updatedAt: _rightUpdatedAt, revision: _rightRevision, ...rightState } = right;
  return sameValue(leftState, rightState);
}

/**
 * Specialization of {@link invertTaskfoldCardMutation} for the dispatcher's
 * "materialize a worktree, then roll it back if the run never started" edit.
 * `workspace` and `workspaceAccess` are treated as one host-owned unit: if the
 * host touched either field concurrently, the host's pair wins whole rather
 * than blending a materialized `workspace` with a host-edited
 * `workspaceAccess` (or vice versa).
 */
export function invertTaskfoldWorkspaceMutation(
  before: TaskfoldCard,
  after: TaskfoldCard,
  current: TaskfoldCard,
): TaskfoldCard {
  const merged = invertTaskfoldCardMutation(before, after, current);
  const afterAutomation = after.metadata?.automation;
  const currentAutomation = current.metadata?.automation;
  if (sameValue(currentAutomation?.workspace, afterAutomation?.workspace)) {
    return merged;
  }
  // Workspace and its authority are one host-owned unit. A same-field host edit
  // wins whole instead of inheriting a hybrid of source and materialized fields.
  const automation: Record<string, unknown> = { ...merged.metadata?.automation };
  if (currentAutomation?.workspace) {
    automation.workspace = currentAutomation.workspace;
  } else {
    delete automation.workspace;
  }
  if (currentAutomation?.workspaceAccess) {
    automation.workspaceAccess = currentAutomation.workspaceAccess;
  } else {
    delete automation.workspaceAccess;
  }
  const metadata: Record<string, unknown> = { ...merged.metadata };
  if (Object.keys(automation).length > 0) {
    metadata.automation = automation;
  } else {
    delete metadata.automation;
  }
  if (Object.keys(metadata).length > 0) {
    return { ...merged, metadata } as TaskfoldCard;
  }
  const withoutMetadata = { ...merged } as Record<string, unknown>;
  delete withoutMetadata.metadata;
  return withoutMetadata as TaskfoldCard;
}
