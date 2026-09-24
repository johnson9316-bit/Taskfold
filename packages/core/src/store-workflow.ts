import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type {
  TaskfoldArtifact,
  TaskfoldCard,
  TaskfoldClaim,
  TaskfoldExecution,
  TaskfoldLaunchState,
  TaskfoldMetadata,
  TaskfoldNotification,
  TaskfoldRunAttempt,
} from "./contract/index.js";
import { isFutureDateTimestampMs, resolveGlobalSingleton, safeEqualSecret } from "./sdk-utils.js";
import { taskfoldCardMatchesLifecycleLink } from "./session-link.js";
import { invertTaskfoldCardMutation } from "./store-compensation.js";
import {
  appendEvent,
  assertCanMutateClaimedCard,
  capText,
  cardBoardId,
  cardChildIds,
  cardParentIds,
  cardRunId,
  cardSessionKey,
  closeRunningAttempts,
  retryBudgetExhausted,
} from "./store-card-helpers.js";
import {
  addTaskfoldDurationMs,
  DEFAULT_CLAIM_TTL_MS,
  isTaskfoldClaimReclaimable,
  MAX_CARD_ARTIFACTS,
  MAX_CARD_COMMENTS,
  MAX_CARD_NOTIFICATIONS,
  secondsToDurationMs,
} from "./store-constants.js";
import type {
  TaskfoldBlockInput,
  TaskfoldCardPatch,
  TaskfoldClaimInput,
  TaskfoldClaimOptions,
  TaskfoldCompleteInput,
  TaskfoldDecomposeChildInput,
  TaskfoldDecomposeInput,
  TaskfoldHeartbeatInput,
  TaskfoldMutationScope,
  TaskfoldProofInput,
  TaskfoldReassignInput,
  TaskfoldReclaimInput,
  TaskfoldSpecifyInput,
} from "./store-inputs.js";
import {
  appendCompletionProof,
  clearDiagnostics,
  deriveChildIdempotencyKey,
  normalizeArtifact,
  normalizeAutomation,
  normalizeBoundedString,
  normalizeOptionalString,
  normalizeProofInput,
  normalizeStatus,
  normalizeStringList,
  removeUndefinedMetadataFields,
} from "./store-normalizers.js";
import { TaskfoldRevisionConflictError } from "./store-core.js";
import { TaskfoldPromoteStore } from "./store-promote.js";

function assertClaimIdentity(claim: TaskfoldClaim, input: TaskfoldHeartbeatInput): void {
  const token = normalizeOptionalString(input.token);
  const ownerId = normalizeOptionalString(input.ownerId);
  if (token && !safeEqualSecret(token, claim.token)) {
    throw new Error("claim token does not match.");
  }
  if (!token && ownerId && ownerId !== claim.ownerId) {
    throw new Error("claim owner does not match.");
  }
}

/**
 * Process-local instance id stamped on every `prepared` launch as
 * `preparedBy`. It is forensic only — a `sqlite3 json_extract(...)` can answer
 * "which Gateway process opened this launch" — and must never gate liveness:
 * the same SQLite file can be opened by more than one Gateway process at
 * once, so regla R (step 4) judges a stale launch by elapsed time alone (需求
 * /15.7-会话生命周期设计.md §4.2). `resolveGlobalSingleton`, rather than a
 * module-level constant, keeps the id stable across a plugin hot reload
 * within the same process.
 */
function taskfoldInstanceId(): string {
  return resolveGlobalSingleton(Symbol.for("taskfold.instanceId"), () => randomUUID());
}

/** Exported so the launch-opening call sites (dispatcher.ts, card-execution.ts) can hold the `prepared` launch identity between `openExecutionLaunch` and the later `acceptExecutionLaunch`/`failExecutionLaunch` call without re-deriving it. */
export type TaskfoldPreparedLaunch = Extract<TaskfoldLaunchState, { phase: "prepared" }>;

/**
 * Isomorphic port of `preparedLaunchMatchesCard` from the extension this
 * codebase was adapted from (see UPSTREAM.md; exact source location cited in
 * 需求/15.7-会话生命周期设计.md §2.1). Confirms the card's `sessionKey` /
 * `runId` / `execution` identity still matches the `prepared` launch a caller
 * captured earlier — i.e. nothing (a concurrent redispatch, a manual edit)
 * moved the card on since. `expected.preparedBy` is compared for identity
 * only, never as a liveness signal (see {@link taskfoldInstanceId}).
 */
function preparedLaunchMatchesCard(card: TaskfoldCard, expected: TaskfoldPreparedLaunch): boolean {
  const launch = card.metadata?.automation?.launch;
  return (
    launch?.phase === "prepared" &&
    launch.requestedSessionKey === expected.requestedSessionKey &&
    launch.provisionalRunId === expected.provisionalRunId &&
    launch.preparedAt === expected.preparedAt &&
    launch.preparedBy === expected.preparedBy &&
    card.sessionKey === expected.requestedSessionKey &&
    card.runId === expected.provisionalRunId &&
    card.execution?.sessionKey === expected.requestedSessionKey &&
    card.execution?.runId === expected.provisionalRunId
  );
}

type TaskfoldExecutionAssociationInput = {
  expectedSessionKey?: string;
  expectedRunId?: string;
  sessionKey: string;
  runId?: string;
  execution: TaskfoldExecution;
  launch?: TaskfoldLaunchState;
};
type TaskfoldExecutionAssociationPatch = TaskfoldCardPatch & { metadata?: TaskfoldMetadata };

/**
 * Isomorphic port of `executionAssociationPatch` from the extension this
 * codebase was adapted from (see UPSTREAM.md; exact source location cited in
 * 需求/15.7-会话生命周期设计.md §2.1). Builds the card patch that moves a
 * `sessionKey`/`runId`/`execution` association forward. Its key job: when a
 * running attempt already exists under the *expected* (old) identity, it
 * rewrites that same attempt's id/sessionKey/runId in place rather than
 * leaving it for `syncExecutionAttemptMetadata` to key a second attempt under
 * the *new* identity — that in-place rewrite is what keeps `accept` from
 * doubling up the running attempt list.
 */
function executionAssociationPatch(
  card: TaskfoldCard,
  input: TaskfoldExecutionAssociationInput,
): TaskfoldExecutionAssociationPatch | undefined {
  if (
    cardSessionKey(card) !== input.expectedSessionKey ||
    cardRunId(card) !== input.expectedRunId
  ) {
    return undefined;
  }
  const attempts = [...(card.metadata?.attempts ?? [])];
  const attemptIndex = attempts.findLastIndex(
    (attempt) =>
      attempt.status === "running" &&
      ((input.expectedRunId && attempt.runId === input.expectedRunId) ||
        (!input.expectedRunId &&
          input.expectedSessionKey &&
          attempt.sessionKey === input.expectedSessionKey)),
  );
  if (attemptIndex >= 0) {
    const attempt = attempts[attemptIndex];
    if (attempt) {
      attempts[attemptIndex] = {
        ...attempt,
        id: input.runId ?? attempt.id,
        sessionKey: input.sessionKey,
        ...(input.runId ? { runId: input.runId } : {}),
      };
    }
  }
  const metadata =
    attemptIndex >= 0 || input.launch
      ? {
          ...card.metadata,
          ...(attemptIndex >= 0 ? { attempts } : {}),
          ...(input.launch
            ? { automation: { ...card.metadata?.automation, launch: input.launch } }
            : {}),
        }
      : undefined;
  return {
    sessionKey: input.sessionKey,
    ...(input.runId ? { runId: input.runId } : {}),
    execution: input.execution,
    ...(metadata ? { metadata } : {}),
  };
}

export class TaskfoldWorkflowStore extends TaskfoldPromoteStore {
  async claimExecution(
    id: string,
    input: { ownerId?: unknown; expectedRevision?: unknown; ttlSeconds?: unknown },
  ): Promise<{ card: TaskfoldCard; token: string }> {
    const ownerId = normalizeBoundedString(input.ownerId, undefined, 120, "claim owner");
    if (!ownerId) {
      throw new Error("claim ownerId is required.");
    }
    if (
      typeof input.expectedRevision !== "number" ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 0
    ) {
      throw new Error("expectedRevision is required.");
    }
    const expectedRevision = input.expectedRevision;
    const ttlSeconds =
      typeof input.ttlSeconds === "number" && Number.isFinite(input.ttlSeconds)
        ? Math.max(1, Math.trunc(input.ttlSeconds))
        : undefined;
    return await this.enqueueMutation(async () => {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`card not found: ${id}`);
      }
      if (existing.revision !== expectedRevision) {
        throw new TaskfoldRevisionConflictError(id, expectedRevision);
      }
      if (existing.metadata?.archivedAt) {
        throw new Error("card is archived.");
      }
      if (await this.isProjectArchived(cardBoardId(existing))) {
        throw new Error("project is archived and cannot start new work.");
      }
      if (
        existing.execution?.status === "running" ||
        existing.metadata?.attempts?.some((attempt) => attempt.status === "running")
      ) {
        throw new Error("card already has an active execution.");
      }
      const now = Date.now();
      const existingClaim = existing.metadata?.claim;
      if (
        existingClaim &&
        (isFutureDateTimestampMs(existingClaim.expiresAt, { nowMs: now }) ||
          !isTaskfoldClaimReclaimable(existingClaim, now))
      ) {
        throw new Error(`card already claimed by ${existingClaim.ownerId}.`);
      }
      const token = randomUUID();
      const expiresAt = addTaskfoldDurationMs(
        now,
        ttlSeconds ? secondsToDurationMs(ttlSeconds) : DEFAULT_CLAIM_TTL_MS,
      );
      const card = await this.updateCard(
        id,
        {
          metadata: {
            ...clearDiagnostics(existing.metadata, ["stranded_ready"]),
            claim: { ownerId, token, claimedAt: now, lastHeartbeatAt: now, expiresAt },
          },
        },
        // Admission decision: the database, not this process, decides who won.
        { expectedRevision },
      );
      return { card, token };
    });
  }

  /**
   * Opens the `absent -> prepared` edge of the launch state machine (需求
   * /15.7-会话生命周期设计.md §5, edge ①): writes the requested
   * `sessionKey`/`runId`/`execution` before the dispatcher hands the card to
   * `subagent.run()`, so a process death in that window leaves durable
   * evidence instead of a silently orphaned claim. Named `openExecutionLaunch`
   * rather than `prepareExecutionLaunch`, as the extension this codebase was
   * adapted from names the equivalent method (see UPSTREAM.md), because Taskfold
   * already has `prepareTaskfoldCardExecution` (card-execution.ts) for a
   * read-only, non-writing preflight — two differently-behaved `prepare*`
   * names on the same card would mislead readers (需求/15.7 §7 步骤 2).
   *
   * Admission is claim scope (`assertCanMutateClaimedCard`), not revision CAS
   * — matching the other claim-scoped mutators in this file (`stopExecution`,
   * `block`, `reclaim`, ...) rather than the CAS-guarded `claimExecution`/
   * `claim`, because the thing being admitted here is "does the caller still
   * hold the claim", not "did the caller win a race for it".
   */
  async openExecutionLaunch(
    id: string,
    input: { requestedSessionKey: unknown; scope?: TaskfoldMutationScope | null },
  ): Promise<{ card: TaskfoldCard; launch: TaskfoldPreparedLaunch }> {
    const requestedSessionKey = normalizeBoundedString(
      input.requestedSessionKey,
      undefined,
      240,
      "requested session key",
    );
    if (!requestedSessionKey) {
      throw new Error("requestedSessionKey is required.");
    }
    return await this.enqueueMutation(async () => {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`card not found: ${id}`);
      }
      assertCanMutateClaimedCard(existing, input.scope === null ? undefined : input.scope);
      const claimToken = existing.metadata?.claim?.token;
      if (!claimToken) {
        throw new Error("card must be claimed before opening an execution launch.");
      }
      const now = Date.now();
      // Same construction as the idempotency key the dispatcher already sends
      // `subagent.run()` (dispatcher.ts:473): keyed on the winning claim token,
      // which is minted once per claim, so it identifies exactly this dispatch
      // attempt without colliding across attempts the way a timestamp could.
      const provisionalRunId = `taskfold:${existing.id}:${claimToken}`;
      const launch: TaskfoldPreparedLaunch = {
        phase: "prepared",
        requestedSessionKey,
        provisionalRunId,
        preparedAt: now,
        preparedBy: taskfoldInstanceId(),
      };
      const execution: TaskfoldExecution = {
        id: existing.execution?.id ?? `${existing.id}:agent-session`,
        kind: "agent-session",
        mode: existing.execution?.mode ?? "autonomous",
        status: "running",
        ...(existing.execution?.engine ? { engine: existing.execution.engine } : {}),
        ...(existing.execution?.model ? { model: existing.execution.model } : {}),
        sessionKey: requestedSessionKey,
        runId: provisionalRunId,
        startedAt: existing.execution?.startedAt ?? existing.startedAt ?? now,
        updatedAt: now,
      };
      const card = await this.updateCard(
        id,
        {
          sessionKey: requestedSessionKey,
          runId: provisionalRunId,
          execution,
          metadata: {
            ...existing.metadata,
            automation: { ...existing.metadata?.automation, launch },
          },
        },
        { allowAutomationLaunch: true },
      );
      const persisted = card.metadata?.automation?.launch;
      if (persisted?.phase !== "prepared") {
        throw new Error("prepared execution launch was not persisted.");
      }
      return { card, launch: persisted };
    });
  }

  /**
   * Advances a `prepared` launch to `accepted` (§5 edge ②) once
   * `subagent.run()` resolves. Rejects — returns `undefined`, does not throw —
   * when `input.expectedLaunch` no longer matches the card's current launch
   * identity, which is the expected, race-driven outcome of a concurrent
   * redispatch (or a duplicate/late accept call) having already moved the
   * card on; mirrors this file's existing `finishExecutionForRun` precedent of
   * signalling "no longer applicable" through the return value rather than an
   * exception. Guarded with `retryOnRevisionConflict` because the identity
   * check must be re-run against the latest card on every compare-and-swap
   * retry, not just the first read (same reasoning as `claim`/`claimOnce`).
   */
  async acceptExecutionLaunch(
    id: string,
    input: {
      expectedLaunch: TaskfoldPreparedLaunch;
      acceptedAt: unknown;
      sessionKey: unknown;
      runId?: unknown;
      engine?: unknown;
      model?: unknown;
    },
  ): Promise<TaskfoldCard | undefined> {
    const acceptedAt =
      typeof input.acceptedAt === "number" &&
      Number.isFinite(input.acceptedAt) &&
      input.acceptedAt >= 0
        ? Math.trunc(input.acceptedAt)
        : undefined;
    if (acceptedAt === undefined) {
      throw new Error("acceptedAt is required.");
    }
    const sessionKey = normalizeBoundedString(
      input.sessionKey,
      undefined,
      240,
      "accepted session key",
    );
    if (!sessionKey) {
      throw new Error("sessionKey is required.");
    }
    const runId = normalizeBoundedString(input.runId, undefined, 160, "accepted run id");
    const engine = normalizeBoundedString(input.engine, undefined, 160, "accepted engine");
    const model = normalizeBoundedString(input.model, undefined, 160, "accepted model");
    const expectedLaunch = input.expectedLaunch;
    return await this.retryOnRevisionConflict(async () => {
      return await this.enqueueMutation(async () => {
        const existing = await this.get(id);
        if (!existing) {
          throw new Error(`card not found: ${id}`);
        }
        if (
          !preparedLaunchMatchesCard(existing, expectedLaunch) ||
          acceptedAt < expectedLaunch.preparedAt
        ) {
          return undefined;
        }
        const now = Date.now();
        const nextEngine = engine ?? existing.execution?.engine;
        const nextModel = model ?? existing.execution?.model;
        const execution: TaskfoldExecution = {
          id: existing.execution?.id ?? `${existing.id}:agent-session`,
          kind: "agent-session",
          mode: existing.execution?.mode ?? "autonomous",
          status: "running",
          ...(nextEngine ? { engine: nextEngine } : {}),
          ...(nextModel ? { model: nextModel } : {}),
          sessionKey,
          ...(runId ? { runId } : {}),
          startedAt: existing.execution?.startedAt ?? existing.startedAt ?? now,
          updatedAt: now,
        };
        const launch: TaskfoldLaunchState = {
          ...expectedLaunch,
          phase: "accepted",
          acceptedAt,
          acceptedSessionKey: sessionKey,
          ...(runId ? { acceptedRunId: runId } : {}),
        };
        const patch = executionAssociationPatch(existing, {
          expectedSessionKey: expectedLaunch.requestedSessionKey,
          expectedRunId: expectedLaunch.provisionalRunId,
          sessionKey,
          runId,
          execution,
          launch,
        });
        if (!patch) {
          return undefined;
        }
        return await this.updateCard(id, patch, {
          allowAutomationLaunch: true,
          expectedRevision: existing.revision,
        });
      });
    });
  }

  /**
   * Advances a `prepared` launch to `failed` (§5 edge ③/④) and fully clears
   * the execution association — `sessionKey`/`runId`/`execution` all go to
   * `null`, not merely to a "blocked" status — because a `prepared` run never
   * actually started on the host: leaving a stale sessionKey/runId behind
   * would let a later, unrelated host event appear to match this card. Like
   * {@link acceptExecutionLaunch}, a stale `expectedLaunch` resolves to `false`
   * rather than throwing, for the same concurrent-redispatch reason.
   */
  async failExecutionLaunch(
    id: string,
    input: { expectedLaunch: TaskfoldPreparedLaunch; reason?: unknown; failedAt?: unknown },
  ): Promise<boolean> {
    const reason =
      normalizeBoundedString(input.reason, undefined, 800, "launch failure reason") ??
      "Prepared launch failed.";
    const failedAtInput =
      typeof input.failedAt === "number" && Number.isFinite(input.failedAt) && input.failedAt >= 0
        ? Math.trunc(input.failedAt)
        : Date.now();
    const expectedLaunch = input.expectedLaunch;
    return await this.retryOnRevisionConflict(async () => {
      return await this.enqueueMutation(async () => {
        const existing = await this.get(id);
        if (!existing) {
          throw new Error(`card not found: ${id}`);
        }
        if (!preparedLaunchMatchesCard(existing, expectedLaunch)) {
          return false;
        }
        const failedAt = Math.max(failedAtInput, expectedLaunch.preparedAt);
        const metadata = existing.metadata ?? {};
        const launch: TaskfoldLaunchState = {
          ...expectedLaunch,
          phase: "failed",
          failedAt,
          reason,
        };
        // 需求/8.4-执行调度与Run控制台.md「Run 与 Card 状态分离」: Card 的 status 是
        // 需求生命周期，Run 的 status 是执行会话生命周期，二者不得互相冒充。映射表里
        // 「启动失败/失败/人工终止 -> blocked」这一行，前提是同一张表首行的
        // 「todo/ready 可启动；宿主接受后更新为 running」——即该行说的是从可启动状态
        // 发起、已被 claim() 推成 running 的那条调度路径（dispatcher.ts）。
        // card-execution.ts 的 startTaskfoldCardExecution 走的是另一条路：它用
        // claimExecution()（不改 status）对任意状态的卡片重跑执行，明确不改变卡片
        // 业务状态；那条路径下 openExecutionLaunch 之后卡片 status 仍是原状态，不会
        // 是 running。因此只在当前 status 已经是 running 时才把失败推成 blocked，
        // 其余状态原样保留，避免一次 Run 的失败冒充/覆盖 Card 自己的生命周期状态。
        const nextStatus = existing.status === "running" ? "blocked" : existing.status;
        await this.updateCard(
          id,
          {
            status: nextStatus,
            sessionKey: null,
            runId: null,
            execution: null,
            metadata: {
              ...metadata,
              claim: undefined,
              attempts: closeRunningAttempts(metadata.attempts, failedAt, "blocked", reason),
              automation: { ...metadata.automation, launch },
            },
          },
          { allowAutomationLaunch: true, expectedRevision: existing.revision },
        );
        return true;
      });
    });
  }

  async stopExecution(
    id: string,
    input: { expectedRunId?: unknown; reason?: unknown } = {},
  ): Promise<TaskfoldCard> {
    return await this.enqueueMutation(async () => {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`card not found: ${id}`);
      }
      const expectedRunId = normalizeOptionalString(input.expectedRunId);
      const runId = cardRunId(existing);
      if (expectedRunId && expectedRunId !== runId) {
        throw new Error("card execution changed before it could be stopped.");
      }
      if (existing.execution?.status !== "running") {
        throw new Error("card has no active execution.");
      }
      const now = Date.now();
      const reason =
        normalizeBoundedString(input.reason, undefined, 1000, "stop reason") ??
        "Taskfold execution stopped by operator.";
      return await this.updateCard(id, {
        execution: { ...existing.execution, status: "blocked", updatedAt: now },
        metadata: {
          ...existing.metadata,
          claim: undefined,
          attempts: closeRunningAttempts(existing.metadata?.attempts, now, "stopped", reason),
          comments: [
            ...(existing.metadata?.comments ?? []),
            { id: randomUUID(), body: reason, createdAt: now },
          ].slice(-MAX_CARD_COMMENTS),
        },
      });
    });
  }

  /**
   * Resolves a run's terminal outcome onto whichever card it belongs to
   * (edge ⑪, 需求/15.7-会话生命周期设计.md §5). `runId` alone was sufficient
   * before the launch state machine, when a card's `runId` was always the
   * host's own. Now a card can still hold `openExecutionLaunch`'s provisional
   * placeholder if a Gateway restart landed between `prepared` and
   * `accepted` — a host-issued `runId` the card never recorded would then
   * silently match nothing. `targetSessionKey` (see `session-link.ts`) is the
   * fallback for exactly that case; at least one of the two is required.
   */
  async finishExecutionForRun(
    runId: string | undefined,
    input: {
      outcome?: unknown;
      endedAt?: unknown;
      reason?: unknown;
      targetSessionKey?: unknown;
    } = {},
  ): Promise<TaskfoldCard | undefined> {
    const normalizedRunId = normalizeOptionalString(runId);
    const targetSessionKey = normalizeOptionalString(input.targetSessionKey);
    if (!normalizedRunId && !targetSessionKey) {
      throw new Error("runId or targetSessionKey is required.");
    }
    return await this.enqueueMutation(async () => {
      const existing = (await this.list()).find((candidate) =>
        taskfoldCardMatchesLifecycleLink(candidate, {
          runId: normalizedRunId,
          sessionKey: targetSessionKey,
        }),
      );
      if (!existing) {
        return undefined;
      }
      if (existing.execution?.status !== "running") {
        return existing;
      }
      const now = Date.now();
      const endedAt =
        typeof input.endedAt === "number" &&
        Number.isSafeInteger(input.endedAt) &&
        input.endedAt >= 0
          ? Math.min(input.endedAt, now)
          : now;
      const outcome = normalizeOptionalString(input.outcome)?.toLowerCase();
      const succeeded = outcome === "ok";
      const reason =
        normalizeBoundedString(input.reason, undefined, 1_000, "execution end reason") ??
        (succeeded
          ? undefined
          : `Taskfold execution ended with ${outcome || "an unknown"} outcome.`);
      return await this.updateCard(existing.id, {
        execution: {
          ...existing.execution,
          status: succeeded ? "done" : "blocked",
          updatedAt: endedAt,
        },
        metadata: {
          ...existing.metadata,
          claim: undefined,
          attempts: closeRunningAttempts(
            existing.metadata?.attempts,
            endedAt,
            succeeded ? "succeeded" : "blocked",
            reason,
          ),
        },
      });
    });
  }

  async claim(
    id: string,
    input: TaskfoldClaimInput,
    options: TaskfoldClaimOptions = {},
  ): Promise<{ card: TaskfoldCard; token: string }> {
    const ownerId = normalizeBoundedString(input.ownerId, undefined, 120, "claim owner");
    if (!ownerId) {
      throw new Error("claim ownerId is required.");
    }
    const ttlSeconds =
      typeof input.ttlSeconds === "number" && Number.isFinite(input.ttlSeconds)
        ? Math.max(1, Math.trunc(input.ttlSeconds))
        : undefined;
    const token =
      normalizeBoundedString(input.token, undefined, 160, "claim token") ?? randomUUID();
    // On a lost compare-and-swap the guards below re-evaluate against fresh
    // state, so a genuine competing claim surfaces as "already claimed" rather
    // than as a revision conflict the caller cannot act on.
    return await this.retryOnRevisionConflict(
      async () => await this.claimOnce(id, { ownerId, ttlSeconds, token }, options),
    );
  }

  private async claimOnce(
    id: string,
    input: { ownerId: string; ttlSeconds: number | undefined; token: string },
    options: TaskfoldClaimOptions,
  ): Promise<{ card: TaskfoldCard; token: string }> {
    const { ownerId, ttlSeconds, token } = input;
    return await this.enqueueMutation(async () => {
      const now = Date.now();
      const expiresAt = addTaskfoldDurationMs(
        now,
        ttlSeconds ? secondsToDurationMs(ttlSeconds) : DEFAULT_CLAIM_TTL_MS,
      );
      const guarded = await this.promoteDependencyReady(id, now);
      if (guarded.metadata?.archivedAt) {
        throw new Error("card is archived.");
      }
      if (await this.isProjectArchived(cardBoardId(guarded))) {
        throw new Error("project is archived and cannot start new work.");
      }
      const expectedAuthority = options.expectedAuthority;
      if (
        expectedAuthority &&
        (guarded.status !== expectedAuthority.status ||
          cardBoardId(guarded) !== expectedAuthority.boardId ||
          guarded.agentId !== expectedAuthority.agentId ||
          !isDeepStrictEqual(
            guarded.metadata?.automation?.workspace,
            expectedAuthority.workspace,
          ) ||
          !isDeepStrictEqual(
            guarded.metadata?.automation?.workspaceAccess,
            expectedAuthority.workspaceAccess,
          ))
      ) {
        throw new Error("card workspace authority changed before claim.");
      }
      const existingClaim = guarded.metadata?.claim;
      const activeClaim =
        existingClaim &&
        (isFutureDateTimestampMs(existingClaim.expiresAt, { nowMs: now }) ||
          // Direct claims must honor the same running-worker heartbeat grace
          // as dispatcher recovery; otherwise they silently steal live tokens.
          (guarded.status === "running" && !isTaskfoldClaimReclaimable(existingClaim, now)))
          ? existingClaim
          : undefined;
      if (cardParentIds(guarded).length > 0 && guarded.status !== "ready" && !activeClaim) {
        throw new Error("card dependencies are not done.");
      }
      if (guarded.status === "scheduled") {
        throw new Error("card is scheduled for later.");
      }
      if (retryBudgetExhausted(guarded)) {
        throw new Error("card exhausted its retry budget.");
      }
      if (activeClaim) {
        throw new Error(`card already claimed by ${activeClaim.ownerId}.`);
      }
      const claimable =
        options.adoptWorkspaceAccess && !guarded.metadata?.automation?.workspaceAccess
          ? await this.updateCard(id, { workspaceAccess: options.adoptWorkspaceAccess })
          : guarded;
      const metadata = clearDiagnostics(claimable.metadata, ["stranded_ready"]);
      const card = await this.updateCard(
        id,
        {
          metadata: {
            ...metadata,
            claim: { ownerId, token, claimedAt: now, lastHeartbeatAt: now, expiresAt },
          },
        },
        // Close the window between deciding the card is unclaimed and writing the
        // claim. Another Gateway process claiming in that gap loses this swap
        // instead of silently overwriting a live worker's token.
        { expectedRevision: claimable.revision },
      );
      const next = await this.updateCard(card.id, {
        status:
          card.status === "backlog" || card.status === "todo" || card.status === "ready"
            ? "running"
            : card.status,
        agentId: card.agentId ?? ownerId,
      });
      return { card: next, token };
    });
  }

  async heartbeat(id: string, input: TaskfoldHeartbeatInput): Promise<TaskfoldCard> {
    const note = normalizeBoundedString(input.note, undefined, 400, "heartbeat note");
    const card = await this.updateMetadata(id, (existing) => {
      const claim = existing.metadata?.claim;
      if (!claim) {
        throw new Error("card is not claimed.");
      }
      const now = Math.max(Date.now(), claim.lastHeartbeatAt + 1);
      assertClaimIdentity(claim, input);
      const nextClaim = {
        ...claim,
        lastHeartbeatAt: now,
        expiresAt: claim.expiresAt
          ? addTaskfoldDurationMs(
              now,
              Math.max(
                1,
                claim.expiresAt > claim.claimedAt
                  ? claim.expiresAt - claim.lastHeartbeatAt
                  : DEFAULT_CLAIM_TTL_MS,
              ),
            )
          : undefined,
      };
      const metadata = clearDiagnostics(existing.metadata, ["running_without_heartbeat"]);
      return {
        ...metadata,
        claim: removeUndefinedMetadataFields({ claim: nextClaim }).claim,
        comments: note
          ? [...(metadata.comments ?? []), { id: randomUUID(), body: note, createdAt: now }].slice(
              -MAX_CARD_COMMENTS,
            )
          : metadata.comments,
      };
    });
    return card;
  }

  async releaseClaim(
    id: string,
    input: TaskfoldHeartbeatInput & { status?: unknown } = {},
  ): Promise<TaskfoldCard> {
    return await this.enqueueMutation(async () => {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`card not found: ${id}`);
      }
      const status =
        input.status === undefined
          ? existing.status
          : normalizeStatus(input.status, existing.status);
      const claim = existing.metadata?.claim;
      if (claim) {
        assertClaimIdentity(claim, input);
      }
      return await this.updateCard(
        id,
        {
          status,
          metadata: { ...existing.metadata, claim: undefined },
        },
        { enforceStatusHolds: input.status !== undefined },
      );
    });
  }

  async complete(
    id: string,
    input: TaskfoldCompleteInput = {},
    scope: TaskfoldMutationScope | null | undefined = input,
  ): Promise<TaskfoldCard> {
    return await this.enqueueMutation(async () => await this.completeDirect(id, input, scope));
  }

  private async completeDirect(
    id: string,
    input: TaskfoldCompleteInput = {},
    scope: TaskfoldMutationScope | null | undefined = input,
  ): Promise<TaskfoldCard> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`card not found: ${id}`);
    }
    assertCanMutateClaimedCard(existing, scope === null ? undefined : scope);
    const now = Date.now();
    const createdCardIds = normalizeStringList(input.createdCardIds, "created card ids", 120);
    const childIds = cardChildIds(existing);
    for (const createdCardId of createdCardIds) {
      const createdCard = await this.get(createdCardId);
      if (!createdCard) {
        throw new Error(`created card not found: ${createdCardId}`);
      }
      const linkedFromParent =
        childIds.includes(createdCardId) && cardParentIds(createdCard).includes(existing.id);
      if (!linkedFromParent) {
        throw new Error(`created card is not linked to this card: ${createdCardId}`);
      }
    }
    const summary = normalizeBoundedString(input.summary, undefined, 2000, "summary");
    const proofInput =
      input.proof && typeof input.proof === "object" && !Array.isArray(input.proof)
        ? (input.proof as TaskfoldProofInput)
        : undefined;
    const proofId = normalizeBoundedString(input.proofId, undefined, 120, "proof id");
    if (input.proofId !== undefined && !proofId) {
      throw new Error("proofId must be a non-empty string.");
    }
    if (proofId && !proofInput) {
      throw new Error("proof is required when proofId is provided.");
    }
    const proof = proofInput ? normalizeProofInput(proofInput, now) : undefined;
    const artifacts = Array.isArray(input.artifacts)
      ? input.artifacts
          .map((artifact) => normalizeArtifact({ ...artifact, createdAt: now }))
          .filter((artifact): artifact is TaskfoldArtifact => artifact !== null)
          .slice(-MAX_CARD_ARTIFACTS)
      : [];
    const metadata = clearDiagnostics(existing.metadata, ["missing_proof"]);
    const notification: TaskfoldNotification = {
      id: randomUUID(),
      kind: "completed",
      createdAt: now,
      sequence: this.nextNotificationSequence(now),
      message: capText(summary, 240) ?? "Taskfold card completed.",
      ...(cardSessionKey(existing) ? { sessionKey: cardSessionKey(existing) } : {}),
      ...(cardRunId(existing) ? { runId: cardRunId(existing) } : {}),
    };
    const execution =
      existing.execution?.status === "running"
        ? { ...existing.execution, status: "done" as const, updatedAt: now }
        : existing.execution;
    return await this.updateCard(
      id,
      {
        status: "done",
        ...(execution ? { execution } : {}),
        metadata: {
          ...metadata,
          claim: undefined,
          attempts: closeRunningAttempts(metadata.attempts, now, "succeeded"),
          failureCount: 0,
          automation: normalizeAutomation(
            {
              ...metadata.automation,
              summary,
              createdCardIds,
            },
            metadata.automation,
          ),
          comments: summary
            ? [
                ...(metadata.comments ?? []),
                { id: randomUUID(), body: summary, createdAt: now },
              ].slice(-MAX_CARD_COMMENTS)
            : metadata.comments,
          proof: proof ? appendCompletionProof(metadata.proof, proof, proofId) : metadata.proof,
          artifacts: artifacts.length
            ? [...(metadata.artifacts ?? []), ...artifacts].slice(-MAX_CARD_ARTIFACTS)
            : metadata.artifacts,
          notifications: [...(metadata.notifications ?? []), notification].slice(
            -MAX_CARD_NOTIFICATIONS,
          ),
        },
      },
      {
        enforceStatusHolds: true,
        ...(proof ? { preserveProofId: proofId ?? proof.id } : {}),
      },
    );
  }

  async block(
    id: string,
    input: TaskfoldBlockInput = {},
    scope: TaskfoldMutationScope | null | undefined = input,
  ): Promise<TaskfoldCard> {
    return await this.enqueueMutation(async () => {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`card not found: ${id}`);
      }
      assertCanMutateClaimedCard(existing, scope === null ? undefined : scope);
      const now = Date.now();
      const reason =
        normalizeBoundedString(input.reason, undefined, 2000, "block reason") ??
        "Taskfold card blocked.";
      const metadata = existing.metadata ?? {};
      const notification: TaskfoldNotification = {
        id: randomUUID(),
        kind: "failed",
        createdAt: now,
        sequence: this.nextNotificationSequence(now),
        message: capText(reason, 240) ?? "Taskfold card blocked.",
        ...(cardSessionKey(existing) ? { sessionKey: cardSessionKey(existing) } : {}),
        ...(cardRunId(existing) ? { runId: cardRunId(existing) } : {}),
      };
      const execution =
        existing.execution?.status === "running"
          ? { ...existing.execution, status: "blocked" as const, updatedAt: now }
          : existing.execution;
      return await this.updateCard(id, {
        status: "blocked",
        ...(execution ? { execution } : {}),
        metadata: {
          ...metadata,
          claim: undefined,
          attempts: closeRunningAttempts(metadata.attempts, now, "blocked", reason),
          failureCount: (metadata.failureCount ?? 0) + 1,
          comments: [
            ...(metadata.comments ?? []),
            { id: randomUUID(), body: reason, createdAt: now },
          ].slice(-MAX_CARD_COMMENTS),
          notifications: [...(metadata.notifications ?? []), notification].slice(
            -MAX_CARD_NOTIFICATIONS,
          ),
        },
      });
    });
  }

  async unblock(id: string, scope?: TaskfoldMutationScope): Promise<TaskfoldCard> {
    return await this.enqueueMutation(async () => {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`card not found: ${id}`);
      }
      assertCanMutateClaimedCard(existing, scope);
      const metadata = clearDiagnostics(existing.metadata, ["blocked_too_long"]);
      return await this.updateCard(id, { status: "todo", metadata: { ...metadata, stale: null } });
    });
  }

  async reassign(
    id: string,
    input: TaskfoldReassignInput = {},
    scope?: TaskfoldMutationScope | null,
  ): Promise<TaskfoldCard> {
    return await this.enqueueMutation(async () => {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`card not found: ${id}`);
      }
      assertCanMutateClaimedCard(existing, scope === null ? undefined : scope);
      const agentId =
        input.agentId === undefined ? existing.agentId : normalizeOptionalString(input.agentId);
      const status =
        input.status === undefined
          ? existing.status
          : normalizeStatus(input.status, existing.status);
      const reason = normalizeBoundedString(input.reason, undefined, 1000, "reassign reason");
      const shouldResetFailures = input.resetFailures !== false;
      const baseMetadata = shouldResetFailures
        ? clearDiagnostics(existing.metadata, ["blocked_too_long", "repeated_failures"])
        : existing.metadata;
      const metadata = {
        ...baseMetadata,
        ...(shouldResetFailures ? { failureCount: 0 } : {}),
        comments: reason
          ? [
              ...(baseMetadata?.comments ?? []),
              { id: randomUUID(), body: reason, createdAt: Date.now() },
            ].slice(-MAX_CARD_COMMENTS)
          : baseMetadata?.comments,
      };
      return await this.updateCard(id, { agentId, status, metadata }, { enforceStatusHolds: true });
    });
  }

  async reclaim(
    id: string,
    input: TaskfoldReclaimInput = {},
    scope?: TaskfoldMutationScope | null,
  ): Promise<TaskfoldCard> {
    return await this.enqueueMutation(async () => {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`card not found: ${id}`);
      }
      assertCanMutateClaimedCard(existing, scope === null ? undefined : scope);
      const now = Date.now();
      const reason =
        normalizeBoundedString(input.reason, undefined, 1000, "reclaim reason") ??
        "Taskfold claim reclaimed.";
      const targetStatus =
        input.status === undefined
          ? existing.status === "running"
            ? "ready"
            : existing.status
          : normalizeStatus(input.status, existing.status);
      const reclaimed = await this.updateCard(
        id,
        {
          status: targetStatus,
          execution: existing.execution?.status === "running" ? null : existing.execution,
          metadata: {
            ...existing.metadata,
            claim: undefined,
            attempts: closeRunningAttempts(existing.metadata?.attempts, now, "stopped", reason),
            comments: [
              ...(existing.metadata?.comments ?? []),
              { id: randomUUID(), body: reason, createdAt: now },
            ].slice(-MAX_CARD_COMMENTS),
            stale: null,
          },
        },
        { enforceStatusHolds: true },
      );
      return await this.promoteDependencyReady(reclaimed.id, now);
    });
  }

  async runs(id: string): Promise<{ card: TaskfoldCard; attempts: TaskfoldRunAttempt[] }> {
    const card = await this.get(id);
    if (!card) {
      throw new Error(`card not found: ${id}`);
    }
    return { card, attempts: card.metadata?.attempts ?? [] };
  }

  async specify(
    id: string,
    input: TaskfoldSpecifyInput = {},
    scope?: TaskfoldMutationScope | null,
  ): Promise<TaskfoldCard> {
    return await this.enqueueMutation(async () => {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`card not found: ${id}`);
      }
      assertCanMutateClaimedCard(existing, scope === null ? undefined : scope);
      if (
        existing.status !== "triage" &&
        existing.status !== "backlog" &&
        existing.status !== "todo"
      ) {
        throw new Error("only triage, backlog, or todo cards can be specified.");
      }
      const requestedStatus = normalizeStatus(input.status, "todo");
      if (requestedStatus !== "todo") {
        throw new Error("specified cards must move to todo.");
      }
      const now = Date.now();
      const summary = normalizeBoundedString(input.summary, undefined, 2000, "spec summary");
      const metadata = {
        ...existing.metadata,
        comments: summary
          ? [
              ...(existing.metadata?.comments ?? []),
              { id: randomUUID(), body: summary, createdAt: now },
            ].slice(-MAX_CARD_COMMENTS)
          : existing.metadata?.comments,
        automation: normalizeAutomation(
          {
            ...existing.metadata?.automation,
            summary: summary ?? existing.metadata?.automation?.summary,
          },
          existing.metadata?.automation,
        ),
      };
      const { summary: _summary, status: _status, ...cardPatch } = input;
      const updated = await this.updateCard(
        id,
        {
          ...cardPatch,
          status: "todo",
          metadata,
        },
        { enforceStatusHolds: true },
      );
      const specified = {
        ...updated,
        events: appendEvent(updated, { kind: "specified" }, now),
      };
      await this.store.register(specified.id, { version: 1, card: specified });
      return specified;
    });
  }

  async decompose(
    id: string,
    input: TaskfoldDecomposeInput = {},
    scope?: TaskfoldMutationScope | null,
  ): Promise<{ parent: TaskfoldCard; children: TaskfoldCard[] }> {
    return await this.enqueueMutation(async () => {
      const parent = await this.get(id);
      if (!parent) {
        throw new Error(`card not found: ${id}`);
      }
      assertCanMutateClaimedCard(parent, scope === null ? undefined : scope);
      const childrenInput = Array.isArray(input.children) ? input.children : [];
      if (childrenInput.length === 0) {
        throw new Error("children are required.");
      }
      if (childrenInput.length > 20) {
        throw new Error("at most 20 children can be created at once.");
      }
      const parentAutomation = parent.metadata?.automation;
      const existingCardIds = new Set((await this.list()).map((card) => card.id));
      const children: TaskfoldCard[] = [];
      const reusedChildSnapshots = new Map<string, TaskfoldCard>();
      // `after` snapshots for the compensation merge below, captured immediately
      // once per loop iteration -- right after this operation's own edit to
      // that card, not lazily in the catch block. Capturing lazily would sweep
      // any concurrent host edit that happened *during* an earlier iteration
      // into what this operation "produced", and a three-way merge that
      // mistakes a host's edit for its own can roll that host edit back
      // instead of preserving it (需求/15.8-并发与补偿设计.md §4.4).
      const reusedChildAfter = new Map<string, TaskfoldCard>();
      let parentAfter: TaskfoldCard = parent;
      try {
        for (const rawChild of childrenInput) {
          if (!rawChild || typeof rawChild !== "object" || Array.isArray(rawChild)) {
            throw new Error("children must be objects.");
          }
          const child = rawChild as TaskfoldDecomposeChildInput;
          const created = await this.createDirect(
            {
              ...child,
              parents: [parent.id],
              boardId: child.boardId ?? parentAutomation?.boardId,
              tenant: child.tenant ?? parentAutomation?.tenant,
              createdByCardId: parent.id,
              idempotencyKey:
                child.idempotencyKey ??
                deriveChildIdempotencyKey(parentAutomation?.idempotencyKey, children.length + 1),
            },
            scope === null ? undefined : scope,
          );
          const reusedUnlinkedChild =
            existingCardIds.has(created.id) && !cardParentIds(created).includes(parent.id);
          if (reusedUnlinkedChild) {
            reusedChildSnapshots.set(created.id, created);
          }
          const linked = cardParentIds(created).includes(parent.id)
            ? created
            : await this.linkCardsDirect(parent.id, created.id, Date.now(), {
                allowStatusOnlyActiveChild: true,
                scope: scope === null ? undefined : scope,
              });
          if (reusedUnlinkedChild) {
            reusedChildAfter.set(created.id, linked);
          }
          children.push(linked);
          parentAfter = (await this.get(parent.id)) ?? parentAfter;
        }
        const summary = normalizeBoundedString(input.summary, undefined, 2000, "decompose summary");
        const completeParent = input.completeParent !== false;
        const updatedParent = completeParent
          ? await this.completeDirect(
              parent.id,
              { summary, createdCardIds: children.map((child) => child.id) },
              scope,
            )
          : await (async () => {
              const latestParent = (await this.get(parent.id)) ?? parent;
              return await this.updateCard(
                parent.id,
                {
                  status:
                    latestParent.status === "triage" || latestParent.status === "backlog"
                      ? "todo"
                      : latestParent.status,
                  metadata: {
                    ...latestParent.metadata,
                    automation: normalizeAutomation(
                      {
                        ...latestParent.metadata?.automation,
                        summary,
                        createdCardIds: children.map((child) => child.id),
                      },
                      latestParent.metadata?.automation,
                    ),
                  },
                },
                { enforceStatusHolds: true },
              );
            })();
        const decomposedParent = {
          ...updatedParent,
          events: appendEvent(updatedParent, { kind: "decomposed" }),
        };
        await this.store.register(decomposedParent.id, { version: 1, card: decomposedParent });
        return { parent: decomposedParent, children };
      } catch (error) {
        for (const child of children.toReversed()) {
          if (!existingCardIds.has(child.id)) {
            await this.deleteDirect(child.id);
          }
        }
        // Both compensations are a three-way merge against each card's
        // pre-decompose snapshot and the `after` this loop captured for it
        // (需求/15.8-并发与补偿设计.md §4.4), replacing the old unconditional
        // store.register() so a concurrent edit made to the card during (or
        // after) decompose survives the rollback instead of being clobbered.
        for (const [childId, childBefore] of reusedChildSnapshots) {
          const childAfter = reusedChildAfter.get(childId) ?? childBefore;
          await this.compensateCardMutation(childId, childBefore, childAfter, invertTaskfoldCardMutation);
        }
        await this.compensateCardMutation(parent.id, parent, parentAfter, invertTaskfoldCardMutation);
        throw error;
      }
    });
  }
}
