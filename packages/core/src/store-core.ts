import { createHash, randomUUID } from "node:crypto";
import type {
  TaskfoldBoardMetadata,
  TaskfoldChange,
  TaskfoldCard,
  TaskfoldSourceReference,
  TaskfoldLink,
  TaskfoldMetadata,
  TaskfoldStatus,
} from "./contract/index.js";
import type {
  PersistedTaskfoldAttachment,
  PersistedTaskfoldBoard,
  PersistedTaskfoldCard,
  PersistedTaskfoldMilestone,
  PersistedTaskfoldNotificationSubscription,
  PersistedTaskfoldProjectDocument,
  TaskfoldCompareAndSwapFailure,
  TaskfoldKeyedStore,
} from "./persistence-types.js";
import { normalizeAutomationPatch, normalizeCardAutomation } from "./store-automation.js";
import {
  assertCanMutateClaimedCard,
  cardBoardId,
  cardParentIds,
  cardRequirementId,
  cardSessionKey,
  compareCards,
  isRequirementCard,
  isActiveDependencyTarget,
  isDependencyPromotableStatus,
  lifecycleStatusSourceUpdatedAtFromPatch,
  removeUndefinedCardFields,
  shouldSkipPersistedLifecycleStatusUpdate,
  syncExecutionAttemptMetadata,
  updateEvent,
  appendEvent,
} from "./store-card-helpers.js";
import {
  createTaskfoldReservedChangeSource,
  TaskfoldChangeTracker,
  type TaskfoldChangeSource,
} from "./store-change-tracker.js";
import {
  invertTaskfoldCardMutation,
  invertTaskfoldWorkspaceMutation,
  sameTaskfoldCardState,
} from "./store-compensation.js";
import {
  MAX_CARD_COMMENTS,
  MAX_CARD_WORKER_LOGS,
  nextTaskfoldCardRevision,
  POSITION_STEP,
} from "./store-constants.js";
import type {
  TaskfoldBoardInput,
  TaskfoldBoardSummary,
  TaskfoldCardPatch,
  TaskfoldCommentInput,
  TaskfoldLinkInput,
  TaskfoldLinkedCreateInput,
  TaskfoldListOptions,
  TaskfoldMutationScope,
  TaskfoldSourceReferenceCreateInput,
  TaskfoldSourceReferenceDeleteInput,
  TaskfoldSourceReferenceReorderInput,
  TaskfoldSourceReferenceUpdateInput,
  TaskfoldStatsResult,
} from "./store-inputs.js";
import {
  appendLinkPreservingDependencies,
  metadataIsEmpty,
  normalizeAutomation,
  normalizeBoardId,
  normalizeBoardIdRequired,
  normalizeBoardMetadata,
  normalizeBoundedString,
  normalizeCardKind,
  normalizeExecution,
  normalizeDelivery,
  normalizeLabels,
  normalizeLinkType,
  normalizeMetadata,
  normalizeNotes,
  normalizeOptionalString,
  normalizePosition,
  normalizePriority,
  normalizeStatus,
  normalizeStringList,
  normalizeTemplateId,
  normalizeTimestamp,
  normalizeTitle,
  syncExecutionSessionKey,
  trimMetadataToBudget,
} from "./store-normalizers.js";

/** Raised when a compare-and-swap loses to a concurrent write. */
export class TaskfoldRevisionConflictError extends Error {
  constructor(
    readonly cardId: string,
    readonly expectedRevision: number,
    /**
     * 为什么没写成（persistence-types.ts 的 {@link TaskfoldCompareAndSwapFailure}）。store 层把锁超时
     * 也映射成 CAS 失败（需求/16 R2），不看这个字段就分不出「别人改过」与「锁被占着」；补偿与重试
     * 逻辑照旧只认错误类型。后端不报原因时按 `revision` 处理。message 与原因无关、保持不变。
     */
    readonly reason: TaskfoldCompareAndSwapFailure = "revision",
  ) {
    super(`card ${cardId} changed since revision ${expectedRevision}.`);
    this.name = "TaskfoldRevisionConflictError";
  }
}

const CARD_CAS_MAX_ATTEMPTS = 3;

/**
 * Advances `revision` on every card write. Wrapping the store means no call site
 * can persist a card without advancing it, which is what lets `revision` serve
 * as the optimistic-concurrency token. The stamp is applied in place so the card
 * object the caller returns matches what was persisted.
 */
function stampCardRevisions(store: TaskfoldKeyedStore): TaskfoldKeyedStore {
  const stamp = (value: PersistedTaskfoldCard): PersistedTaskfoldCard => {
    if (value?.version === 1 && value.card) {
      value.card.revision = nextTaskfoldCardRevision(value.card.revision);
    }
    return value;
  };
  return {
    register: async (key, value) => await store.register(key, stamp(value)),
    lookup: async (key) => await store.lookup(key),
    delete: async (key) => await store.delete(key),
    entries: async () => await store.entries(),
    compareAndSwap: async (key, expectedRevision, value, onReject) =>
      await store.compareAndSwap(key, expectedRevision, stamp(value), onReject),
    ...(store.registerIfAbsent
      ? {
          registerIfAbsent: async (key: string, value) =>
            await store.registerIfAbsent!(key, stamp(value)),
        }
      : {}),
  };
}

/**
 * Deterministic RFC 9562 version-8 UUID derived from a session key, so that
 * two processes racing to capture the same brand-new session converge on the
 * same card id (and therefore the same `registerIfAbsent` row) instead of
 * each creating their own card.
 */
function sessionCaptureCardId(sessionKey: string): string {
  const digest = createHash("sha256")
    .update("openclaw.taskfold.session-capture.v1\0")
    .update(sessionKey)
    .digest();
  digest.writeUInt8((digest.readUInt8(6) & 0x0f) | 0x80, 6);
  digest.writeUInt8((digest.readUInt8(8) & 0x3f) | 0x80, 8);
  const hex = digest.toString("hex", 0, 16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class TaskfoldCoreStore {
  private mutationQueue: Promise<unknown> = Promise.resolve();
  private lastNotificationSequence = 0;
  private readonly changes: TaskfoldChangeTracker;
  protected readonly store: TaskfoldKeyedStore;
  protected readonly boardStore: TaskfoldKeyedStore<PersistedTaskfoldBoard>;
  protected readonly milestoneStore: TaskfoldKeyedStore<PersistedTaskfoldMilestone>;
  protected readonly documentStore: TaskfoldKeyedStore<PersistedTaskfoldProjectDocument>;
  protected readonly subscriptionStore: TaskfoldKeyedStore<PersistedTaskfoldNotificationSubscription>;
  protected readonly attachmentStore: TaskfoldKeyedStore<PersistedTaskfoldAttachment>;

  constructor(
    store: TaskfoldKeyedStore,
    stores: {
      boards?: TaskfoldKeyedStore<PersistedTaskfoldBoard>;
      milestones?: TaskfoldKeyedStore<PersistedTaskfoldMilestone>;
      documents?: TaskfoldKeyedStore<PersistedTaskfoldProjectDocument>;
      subscriptions?: TaskfoldKeyedStore<PersistedTaskfoldNotificationSubscription>;
      attachments?: TaskfoldKeyedStore<PersistedTaskfoldAttachment>;
      dataVersion?: () => number;
      changeEpoch?: string;
      reserveChangeRevisions?: (count: number) => number;
      /** 给了就用它驱动变更游标（文件后端），上面三项随之不用；不给按块预留（SQLite、内存）。 */
      changeSource?: TaskfoldChangeSource;
    } = {},
  ) {
    this.changes = new TaskfoldChangeTracker(
      stores.changeSource ??
        createTaskfoldReservedChangeSource({
          dataVersion: stores.dataVersion,
          epoch: stores.changeEpoch,
          reserveRevisions: stores.reserveChangeRevisions,
        }),
    );
    this.store = this.changes.track(stampCardRevisions(store));
    this.boardStore = this.changes.track(
      stores.boards ?? (store as unknown as TaskfoldKeyedStore<PersistedTaskfoldBoard>),
    );
    this.milestoneStore = this.changes.track(
      stores.milestones ?? (store as unknown as TaskfoldKeyedStore<PersistedTaskfoldMilestone>),
    );
    this.documentStore = this.changes.track(
      stores.documents ??
        (store as unknown as TaskfoldKeyedStore<PersistedTaskfoldProjectDocument>),
    );
    this.subscriptionStore =
      stores.subscriptions ??
      (store as unknown as TaskfoldKeyedStore<PersistedTaskfoldNotificationSubscription>);
    this.attachmentStore =
      stores.attachments ?? (store as unknown as TaskfoldKeyedStore<PersistedTaskfoldAttachment>);
  }

  announceChangeEpoch(): void {
    this.changes.announceEpoch();
  }

  reconcileExternalChanges(): boolean {
    return this.changes.reconcileExternalChanges();
  }

  currentChange(): TaskfoldChange | undefined {
    return this.changes.current();
  }

  /** 每次这个 store 的变更游标前进（本进程写入、或 {@link reconcileExternalChanges} 轮询到别处的变化）都会回调。 */
  subscribeChanges(listener: (change: TaskfoldChange) => void): () => void {
    return this.changes.subscribe(listener);
  }

  async waitForChange(
    after: TaskfoldChange | undefined,
    timeoutMs: number,
  ): Promise<{ change?: TaskfoldChange; timedOut: boolean }> {
    return await this.changes.waitForChange(after, timeoutMs);
  }

  protected async enqueueMutation<T>(run: () => Promise<T>): Promise<T> {
    const runAndNotify = async () => await this.changes.runMutation(run);
    const result = this.mutationQueue.then(runAndNotify, runAndNotify);
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return await result;
  }

  protected async updateMetadata(
    id: string,
    mutate: (existing: TaskfoldCard) => TaskfoldMetadata,
    options: { preserveProofId?: string } = {},
  ): Promise<TaskfoldCard> {
    // 单卡读改写：metadata 由这次读到的卡算出，就以它的 revision 做 CAS；输给并发写入
    // （别的进程、CLI）就整体重读重算，而不是拿旧快照覆盖对方（TASK-6）。
    return await this.retryOnRevisionConflict(
      async () =>
        await this.enqueueMutation(async () => {
          const existing = await this.get(id);
          if (!existing) {
            throw new Error(`card not found: ${id}`);
          }
          return await this.updateCard(
            id,
            { metadata: mutate(existing) },
            { ...options, expectedRevision: existing.revision },
          );
        }),
    );
  }

  protected async deleteDetachedAttachments(
    existing: TaskfoldCard,
    next: TaskfoldCard,
  ): Promise<void> {
    const nextIds = new Set(next.metadata?.attachments?.map((attachment) => attachment.id) ?? []);
    for (const attachment of existing.metadata?.attachments ?? []) {
      if (!nextIds.has(attachment.id)) {
        await this.attachmentStore.delete(attachment.id);
      }
    }
  }

  protected nextNotificationSequence(now: number): number {
    const base = Math.max(0, Math.trunc(now)) * 1000;
    this.lastNotificationSequence = Math.max(this.lastNotificationSequence + 1, base);
    return this.lastNotificationSequence;
  }

  async list(options: TaskfoldListOptions = {}): Promise<TaskfoldCard[]> {
    const boardId = normalizeBoardId(options.boardId);
    const entries = await this.store.entries();
    return entries
      .map((entry) => entry.value)
      .filter(
        (entry): entry is PersistedTaskfoldCard => entry?.version === 1 && Boolean(entry.card?.id),
      )
      .map((entry) => entry.card)
      .filter((card) => !boardId || cardBoardId(card) === boardId)
      .toSorted(compareCards);
  }

  async listBoards(): Promise<{ boards: TaskfoldBoardSummary[] }> {
    const boards = new Map<string, TaskfoldBoardSummary>();
    for (const entry of await this.boardStore.entries()) {
      if (entry.value?.version !== 1 || !entry.value.board?.id) {
        continue;
      }
      const board = entry.value.board;
      boards.set(board.id, {
        id: board.id,
        ...(board.name ? { name: board.name } : {}),
        ...(board.description ? { description: board.description } : {}),
        ...(board.icon ? { icon: board.icon } : {}),
        ...(board.color ? { color: board.color } : {}),
        ...(board.position !== undefined ? { position: board.position } : {}),
        ...(board.version ? { version: board.version } : {}),
        ...(board.currentObjective ? { currentObjective: board.currentObjective } : {}),
        ...(board.coreValue ? { coreValue: board.coreValue } : {}),
        ...(board.sourceOfTruth ? { sourceOfTruth: board.sourceOfTruth } : {}),
        ...(board.repositoryUrl ? { repositoryUrl: board.repositoryUrl } : {}),
        ...(board.planningPath ? { planningPath: board.planningPath } : {}),
        ...(board.homepageUrl ? { homepageUrl: board.homepageUrl } : {}),
        ...(board.defaultWorkspace ? { defaultWorkspace: board.defaultWorkspace } : {}),
        ...(board.orchestration ? { orchestration: board.orchestration } : {}),
        ...(board.boardView ? { boardView: board.boardView } : {}),
        total: 0,
        active: 0,
        archived: 0,
        byStatus: {},
        updatedAt: board.updatedAt,
        ...(board.archivedAt ? { archivedAt: board.archivedAt } : {}),
      });
    }
    if (!boards.has("default")) {
      boards.set("default", {
        id: "default",
        total: 0,
        active: 0,
        archived: 0,
        byStatus: {},
      });
    }
    for (const card of await this.list()) {
      const boardId = cardBoardId(card);
      const summary =
        boards.get(boardId) ??
        ({
          id: boardId,
          total: 0,
          active: 0,
          archived: 0,
          byStatus: {},
        } satisfies TaskfoldBoardSummary);
      summary.total += 1;
      if (card.metadata?.archivedAt) {
        summary.archived += 1;
      } else {
        summary.active += 1;
      }
      summary.byStatus[card.status] = (summary.byStatus[card.status] ?? 0) + 1;
      summary.updatedAt = Math.max(summary.updatedAt ?? 0, card.updatedAt);
      boards.set(boardId, summary);
    }
    return {
      boards: [...boards.values()].toSorted((a, b) =>
        a.id === "default" ? -1 : b.id === "default" ? 1 : a.id.localeCompare(b.id),
      ),
    };
  }

  async isProjectArchived(boardId: string): Promise<boolean> {
    const board = await this.boardStore.lookup(boardId);
    return Boolean(board?.version === 1 && board.board.archivedAt);
  }

  async upsertBoard(input: TaskfoldBoardInput): Promise<TaskfoldBoardMetadata> {
    return await this.enqueueMutation(async () => {
      const id = normalizeBoardIdRequired(input.id);
      const existing = await this.boardStore.lookup(id);
      const board = normalizeBoardMetadata({ ...input, id }, existing?.board);
      await this.boardStore.register(id, { version: 1, board });
      return board;
    });
  }

  async archiveBoard(id: unknown, archived: unknown = true): Promise<TaskfoldBoardMetadata> {
    return await this.upsertBoard({ id, archived });
  }

  async deleteBoard(id: unknown): Promise<{ deleted: boolean }> {
    return await this.enqueueMutation(async () => {
      const boardId = normalizeBoardIdRequired(id);
      if (boardId === "default") {
        throw new Error("default board cannot be deleted.");
      }
      if ((await this.list({ boardId })).length > 0) {
        throw new Error("board still has cards; archive it or move/delete the cards first.");
      }
      for (const entry of await this.subscriptionStore.entries()) {
        if (entry.value?.version === 1 && entry.value.subscription?.boardId === boardId) {
          await this.subscriptionStore.delete(entry.key);
        }
      }
      return { deleted: await this.boardStore.delete(boardId) };
    });
  }

  async stats(input: TaskfoldListOptions = {}, now = Date.now()): Promise<TaskfoldStatsResult> {
    const cards = await this.list(input);
    const boardId = normalizeBoardId(input.boardId) ?? "all";
    const byStatus: Partial<Record<TaskfoldStatus, number>> = {};
    const byAgent = Object.create(null) as Record<string, number>;
    let oldestReadyAt: number | undefined;
    let updatedAt: number | undefined;
    let archived = 0;
    for (const card of cards) {
      byStatus[card.status] = (byStatus[card.status] ?? 0) + 1;
      byAgent[card.agentId ?? "(default)"] = (byAgent[card.agentId ?? "(default)"] ?? 0) + 1;
      if (card.metadata?.archivedAt) {
        archived += 1;
      }
      if (card.status === "ready" && !card.metadata?.archivedAt) {
        oldestReadyAt = Math.min(oldestReadyAt ?? card.updatedAt, card.updatedAt);
      }
      updatedAt = Math.max(updatedAt ?? 0, card.updatedAt);
    }
    return {
      id: boardId,
      total: cards.length,
      active: cards.length - archived,
      archived,
      byStatus,
      byAgent,
      ...(oldestReadyAt ? { oldestReadyAgeMs: Math.max(0, now - oldestReadyAt) } : {}),
      ...(updatedAt ? { updatedAt } : {}),
    };
  }

  async get(id: string): Promise<TaskfoldCard | undefined> {
    const entry = await this.store.lookup(id.trim());
    return entry?.version === 1 ? entry.card : undefined;
  }

  private async removeReferencesToCard(cardId: string): Promise<void> {
    for (const card of await this.list()) {
      const links = card.metadata?.links;
      if (!links?.some((link) => link.targetCardId === cardId)) {
        continue;
      }
      await this.updateCard(card.id, {
        metadata: {
          ...card.metadata,
          links: links.filter((link) => link.targetCardId !== cardId),
        },
      });
    }
  }

  async create(
    input: TaskfoldLinkedCreateInput,
    scope?: TaskfoldMutationScope,
  ): Promise<TaskfoldCard> {
    return await this.enqueueMutation(async () => {
      let card = await this.createDirect(input, scope);
      const requirementId = normalizeOptionalString(input.requirementId);
      if (!requirementId) {
        return card;
      }
      try {
        card = await this.setCardRequirementDirect(card.id, requirementId, Date.now(), scope);
        return card;
      } catch (error) {
        // Only clean up the card this call just created if nothing else has
        // touched it since: a concurrent edit landing in this window must
        // survive, even though that leaves the card without its intended
        // requirement (需求/15.8-并发与补偿设计.md §4.4, rollbackCreatedCard).
        const current = await this.get(card.id);
        if (current && sameTaskfoldCardState(current, card)) {
          await this.store.delete(card.id);
          await this.removeReferencesToCard(card.id);
        }
        throw error;
      }
    });
  }

  protected async createDirect(
    input: TaskfoldLinkedCreateInput,
    scope?: TaskfoldMutationScope,
    options: { cardId?: string; insertIfAbsent?: boolean } = {},
  ): Promise<TaskfoldCard> {
    const now = Date.now();
    const requestedStatus = normalizeStatus(input.status, "todo");
    const kind = normalizeCardKind(input.kind);
    const cards = await this.list();
    const parents = normalizeStringList(input.parents, "parents", 120);
    const automation = normalizeCardAutomation(input);
    const heldBySchedule =
      Boolean(automation?.scheduledAt && automation.scheduledAt > now) &&
      requestedStatus !== "blocked";
    let status: TaskfoldStatus = heldBySchedule ? "scheduled" : requestedStatus;
    let heldByDependencies = false;
    if (parents.length > 0 && (status === "running" || status === "review")) {
      status = "todo";
      heldByDependencies = true;
    }
    if (automation?.idempotencyKey) {
      const existing = cards.find(
        (card) =>
          card.metadata?.automation?.idempotencyKey === automation.idempotencyKey &&
          card.metadata?.automation?.tenant === automation.tenant &&
          cardBoardId(card) === (automation.boardId ?? "default"),
      );
      if (existing) {
        return existing;
      }
    }
    const cardsById = new Map(cards.map((card) => [card.id, card]));
    const parentCards = parents.map((parentId) => {
      const parent = cardsById.get(parentId);
      if (!parent) {
        throw new Error(`card not found: ${parentId}`);
      }
      return parent;
    });
    const childAutomation = normalizeAutomation(
      {
        ...automation,
        createdByCardId:
          automation?.createdByCardId ?? (parents.length === 1 ? parents[0] : undefined),
      },
      automation,
    );
    const normalizedPosition = normalizePosition(input.position, Number.NaN);
    const notes = normalizeNotes(input.notes);
    const agentId = normalizeOptionalString(input.agentId);
    const sessionKey = normalizeOptionalString(input.sessionKey);
    const runId = normalizeOptionalString(input.runId);
    const taskId = normalizeOptionalString(input.taskId);
    const sourceUrl = normalizeOptionalString(input.sourceUrl);
    const normalizedExecution = normalizeExecution(input.execution);
    const delivery = normalizeDelivery(input.delivery, undefined, now);
    const execution =
      normalizedExecution?.status === "running" && (heldBySchedule || heldByDependencies)
        ? undefined
        : normalizedExecution;
    const startedAt =
      input.startedAt === undefined
        ? status === "running"
          ? now
          : undefined
        : normalizeTimestamp(input.startedAt, 0) || undefined;
    const completedAt =
      input.completedAt === undefined
        ? status === "done"
          ? now
          : undefined
        : normalizeTimestamp(input.completedAt, 0) || undefined;
    const metadata = normalizeMetadata(
      input.metadata,
      {
        templateId: normalizeTemplateId(input.templateId),
        ...(childAutomation ? { automation: childAutomation } : {}),
      },
      { allowDependencyLinks: false },
    );
    const syncedMetadata = trimMetadataToBudget(
      syncExecutionAttemptMetadata(metadata, execution, now),
    );
    const boardId = syncedMetadata.automation?.boardId ?? "default";
    const milestoneId = normalizeOptionalString(input.milestoneId);
    const position = Number.isFinite(normalizedPosition)
      ? normalizedPosition
      : Math.max(
          0,
          ...cards
            .filter(
              (card) => cardBoardId(card) === boardId && card.milestoneId === milestoneId,
            )
            .map((card) => card.position),
        ) + POSITION_STEP;
    let card: TaskfoldCard = {
      id: options.cardId ?? randomUUID(),
      title: normalizeTitle(input.title),
      ...(kind === "requirement" ? { kind } : {}),
      status,
      priority: normalizePriority(input.priority, "normal"),
      labels: normalizeLabels(input.labels),
      ...(milestoneId ? { milestoneId } : {}),
      position,
      createdAt: now,
      updatedAt: now,
      // Stamped to the first real revision by the persistence boundary below.
      revision: 0,
      events: [
        {
          id: randomUUID(),
          kind: "created",
          at: now,
          toStatus: status,
          ...(sessionKey ? { sessionKey } : {}),
          ...(runId ? { runId } : {}),
        },
      ],
      ...(notes ? { notes } : {}),
      ...(agentId ? { agentId } : {}),
      ...(sessionKey ? { sessionKey } : {}),
      ...(runId ? { runId } : {}),
      ...(taskId ? { taskId } : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(execution ? { execution } : {}),
      ...(delivery ? { delivery } : {}),
      ...(startedAt ? { startedAt } : {}),
      ...(completedAt ? { completedAt } : {}),
      ...(!metadataIsEmpty(syncedMetadata) ? { metadata: syncedMetadata } : {}),
    };
    if (options.insertIfAbsent && this.store.registerIfAbsent) {
      const inserted = await this.store.registerIfAbsent(card.id, { version: 1, card });
      if (!inserted) {
        const winner = await this.get(card.id);
        if (!winner) {
          throw new Error("captured session card disappeared during creation.");
        }
        return winner;
      }
    } else {
      await this.store.register(card.id, { version: 1, card });
    }
    try {
      if (kind === "requirement" && parentCards.length > 0) {
        throw new Error("requirement cards cannot be child cards.");
      }
      for (const parent of parentCards) {
        if (isRequirementCard(parent)) {
          throw new Error("requirement cards cannot be execution dependencies.");
        }
        card = await this.linkCardsDirect(parent.id, card.id, now, {
          allowStatusOnlyActiveChild: true,
          scope,
        });
      }
    } catch (error) {
      // Same guard as create()'s outer catch: only delete what this call itself
      // produced. A concurrent edit to the new card during dependency linking
      // must survive, even without the parent link this call was attempting.
      const current = await this.get(card.id);
      if (current && sameTaskfoldCardState(current, card)) {
        await this.store.delete(card.id);
        await this.removeReferencesToCard(card.id);
      }
      throw error;
    }
    return card;
  }

  /**
   * Turn an already-running session into a card, once. Idempotent by
   * `sessionKey`: a second call for the same key returns the existing card
   * unchanged, or restores it first if it was archived, instead of creating a
   * duplicate.
   */
  async captureSession(input: TaskfoldLinkedCreateInput): Promise<TaskfoldCard> {
    return await this.retryOnRevisionConflict(async () => await this.captureSessionOnce(input));
  }

  private async captureSessionOnce(input: TaskfoldLinkedCreateInput): Promise<TaskfoldCard> {
    return await this.enqueueMutation(async () => {
      const sessionKey = normalizeOptionalString(input.sessionKey);
      if (!sessionKey) {
        throw new Error("sessionKey is required.");
      }
      const boardId = normalizeBoardId(input.boardId) ?? "default";
      const matches = (await this.list())
        .filter((card) => cardSessionKey(card) === sessionKey)
        .toSorted((left, right) => right.updatedAt - left.updatedAt);
      const existing =
        matches.find((card) => !card.metadata?.archivedAt) ??
        matches.find((card) => Boolean(card.metadata?.archivedAt));
      if (existing) {
        if (!existing.metadata?.archivedAt) {
          return existing;
        }
        if (cardSessionKey(existing) !== sessionKey) {
          throw new Error("captured session identity collision.");
        }
        return await this.updateCard(
          existing.id,
          { metadata: { ...existing.metadata, archivedAt: 0 } },
          { expectedRevision: existing.revision },
        );
      }
      const winner = await this.createDirect(
        { ...input, boardId, parents: undefined },
        undefined,
        { cardId: sessionCaptureCardId(sessionKey), insertIfAbsent: true },
      );
      if (cardSessionKey(winner) !== sessionKey) {
        throw new Error("captured session identity collision.");
      }
      return winner;
    });
  }

  async update(
    id: string,
    patch: TaskfoldCardPatch,
    options: {
      /** See {@link updateCard}: write only if the card is still at this revision. */
      expectedRevision?: number;
    } = {},
  ): Promise<TaskfoldCard> {
    const run = async () =>
      await this.enqueueMutation(
        async () =>
          await this.updateCard(id, patch, {
            allowMetadataDependencyLinks: false,
            enforceStatusHolds: true,
            ...(options.expectedRevision !== undefined
              ? { expectedRevision: options.expectedRevision }
              : {}),
          }),
      );
    // 调用方给了 expectedRevision：冲突要原样报给它（CLI、面板的 CAS），不重试。
    // 没给：字段级 patch，输给并发写入就在最新版本上重放这份 patch（TASK-6）。
    return options.expectedRevision !== undefined ? await run() : await this.retryOnRevisionConflict(run);
  }

  protected async updateCard(
    id: string,
    patch: TaskfoldCardPatch,
    options: {
      allowMetadataDependencyLinks?: boolean;
      enforceStatusHolds?: boolean;
      preserveProofId?: string;
      /**
       * Compare-and-swap guard. When set, the write lands only if the card is
       * still at this revision, and a losing write throws
       * {@link TaskfoldRevisionConflictError} instead of clobbering the winner.
       * Required for admission decisions (claiming, dispatching) that must stay
       * correct across processes rather than only within this one.
       */
      expectedRevision?: number;
      /**
       * Trust gate for `metadata.automation.launch` (需求/15.7 §4.1). Only the
       * internal launch-state writers in store-workflow.ts pass this; the
       * public {@link update} entry point never exposes it, so a public/gateway
       * write can never mint or clobber a launch phase.
       */
      allowAutomationLaunch?: boolean;
    } = {},
  ): Promise<TaskfoldCard> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`card not found: ${id}`);
    }
    if (options.expectedRevision !== undefined && existing.revision !== options.expectedRevision) {
      throw new TaskfoldRevisionConflictError(id, options.expectedRevision);
    }
    const lifecycleStatusSourceUpdatedAt = lifecycleStatusSourceUpdatedAtFromPatch(patch.metadata);
    const existingLifecycleStatusSourceUpdatedAt =
      existing.metadata?.lifecycleStatusSourceUpdatedAt;
    const hasFreshLifecycleStatusSource =
      lifecycleStatusSourceUpdatedAt !== undefined &&
      lifecycleStatusSourceUpdatedAt !== existingLifecycleStatusSourceUpdatedAt;
    let effectivePatch = patch;
    if (
      patch.status !== undefined &&
      lifecycleStatusSourceUpdatedAt !== undefined &&
      shouldSkipPersistedLifecycleStatusUpdate(existing, lifecycleStatusSourceUpdatedAt)
    ) {
      // Ignore stale lifecycle status writes, but still accept any non-status updates in the patch.
      effectivePatch = { ...patch, status: undefined };
      if (patch.metadata && typeof patch.metadata === "object" && !Array.isArray(patch.metadata)) {
        const metadataPatch = patch.metadata as Record<string, unknown>;
        const { lifecycleStatusSourceUpdatedAt: _ignored, ...rest } = metadataPatch;
        effectivePatch.metadata = Object.keys(rest).length > 0 ? rest : undefined;
      }
      const hasSemanticPatch = Object.entries(effectivePatch).some(
        ([key, value]) => key !== "status" && key !== "metadata" && value !== undefined,
      );
      if (!hasSemanticPatch && effectivePatch.metadata === undefined) {
        return existing;
      }
    }
    const status = normalizeStatus(effectivePatch.status, existing.status);
    const now = Date.now();
    const startedAt =
      effectivePatch.startedAt === undefined
        ? status === "running"
          ? (existing.startedAt ?? now)
          : existing.startedAt
        : normalizeTimestamp(effectivePatch.startedAt, 0) || undefined;
    const completedAt =
      effectivePatch.completedAt === undefined
        ? status === "done"
          ? (existing.completedAt ?? now)
          : undefined
        : normalizeTimestamp(effectivePatch.completedAt, 0) || undefined;
    const sessionKey =
      effectivePatch.sessionKey === undefined
        ? existing.sessionKey
        : normalizeOptionalString(effectivePatch.sessionKey);
    const execution =
      effectivePatch.execution === undefined
        ? effectivePatch.sessionKey === undefined
          ? existing.execution
          : syncExecutionSessionKey(existing.execution, sessionKey)
        : normalizeExecution(effectivePatch.execution);
    let metadata = normalizeMetadata(effectivePatch.metadata, existing.metadata, {
      allowDependencyLinks: options.allowMetadataDependencyLinks !== false,
      preserveProofId: options.preserveProofId,
      allowAutomationLaunch: options.allowAutomationLaunch,
    });
    if (status !== existing.status && !hasFreshLifecycleStatusSource) {
      // Status patches often spread existing metadata. Only a newly supplied
      // lifecycle source is provenance; copied markers must not survive a manual transition.
      metadata = { ...metadata, lifecycleStatusSourceUpdatedAt: undefined };
    }
    const effectivePatchRecord = effectivePatch as Record<string, unknown>;
    const automationPatch: Record<string, unknown> = {};
    for (const key of [
      "tenant",
      "boardId",
      "createdByCardId",
      "idempotencyKey",
      "skills",
      "workspace",
      "workspaceAccess",
      "maxRuntimeSeconds",
      "maxRetries",
      "scheduledAt",
    ] as const) {
      if (Object.hasOwn(effectivePatchRecord, key) && effectivePatchRecord[key] !== undefined) {
        automationPatch[key] = effectivePatchRecord[key];
      }
    }
    if (Object.keys(automationPatch).length > 0) {
      metadata = trimMetadataToBudget(
        {
          ...metadata,
          automation: normalizeAutomationPatch(automationPatch, metadata.automation),
        },
        options,
      );
    }
    const next = removeUndefinedCardFields({
      ...existing,
      title:
        effectivePatch.title === undefined ? existing.title : normalizeTitle(effectivePatch.title),
      notes:
        effectivePatch.notes === undefined ? existing.notes : normalizeNotes(effectivePatch.notes),
      status,
      priority:
        effectivePatch.priority === undefined
          ? existing.priority
          : normalizePriority(effectivePatch.priority, existing.priority),
      labels:
        effectivePatch.labels === undefined
          ? existing.labels
          : normalizeLabels(effectivePatch.labels),
      agentId:
        effectivePatch.agentId === undefined
          ? existing.agentId
          : normalizeOptionalString(effectivePatch.agentId),
      sessionKey,
      runId:
        effectivePatch.runId === undefined
          ? existing.runId
          : normalizeOptionalString(effectivePatch.runId),
      taskId:
        effectivePatch.taskId === undefined
          ? existing.taskId
          : normalizeOptionalString(effectivePatch.taskId),
      sourceUrl:
        effectivePatch.sourceUrl === undefined
          ? existing.sourceUrl
          : normalizeOptionalString(effectivePatch.sourceUrl),
      execution,
      delivery:
        effectivePatch.delivery === undefined
          ? existing.delivery
          : normalizeDelivery(effectivePatch.delivery, existing.delivery, now),
      metadata:
        effectivePatch.templateId === undefined
          ? metadata
          : { ...metadata, templateId: normalizeTemplateId(effectivePatch.templateId) },
      position:
        effectivePatchRecord.position === undefined
          ? existing.position
          : normalizePosition(effectivePatchRecord.position, existing.position),
      updatedAt: now,
      ...(startedAt ? { startedAt } : {}),
      ...(completedAt ? { completedAt } : {}),
    });
    next.metadata = trimMetadataToBudget(
      syncExecutionAttemptMetadata(next.metadata ?? {}, execution, now),
      options,
    );
    next.events = appendEvent(next, updateEvent(existing, next), now);
    if (options.enforceStatusHolds && effectivePatch.status !== undefined) {
      await this.assertActiveStatusAllowed(existing, next, now);
    }
    if (status !== "done") {
      delete next.completedAt;
    }
    if (effectivePatch.startedAt !== undefined && !startedAt) {
      delete next.startedAt;
    }
    if (effectivePatch.completedAt !== undefined && !completedAt) {
      delete next.completedAt;
    }
    if (metadataIsEmpty(next.metadata)) {
      delete next.metadata;
    }
    // 调用方没给 expectedRevision 时，也以上面读到的 revision 做 CAS：读在锁外，读与写之间
    // 别的进程（CLI、另一个宿主）写过，这次写就报冲突，不拿旧快照整卡覆盖（TASK-6）。
    await this.persistCard(next, options.expectedRevision ?? existing.revision);
    await this.deleteDetachedAttachments(existing, next);
    return next;
  }

  /**
   * Single card write boundary. With `expectedRevision` the backend performs the
   * check and the write atomically (`compareAndSwap` is required on the cards
   * store, 需求/16 R1); without it this is an unconditional write.
   *
   * `protected`, not `private`: {@link compensateCardMutation} below and
   * store-workflow.ts's `decompose` rollback both need to persist an already-
   * merged card verbatim (no re-normalization, no patch semantics), which
   * `update`/`updateCard` do not offer.
   */
  protected async persistCard(card: TaskfoldCard, expectedRevision?: number): Promise<void> {
    if (expectedRevision === undefined) {
      await this.store.register(card.id, { version: 1, card });
      return;
    }
    let reason: TaskfoldCompareAndSwapFailure | undefined;
    const swapped = await this.store.compareAndSwap(
      card.id,
      expectedRevision,
      { version: 1, card },
      (rejected) => {
        reason = rejected;
      },
    );
    if (!swapped) {
      throw new TaskfoldRevisionConflictError(card.id, expectedRevision, reason);
    }
  }

  /**
   * Retries `run` when it loses a compare-and-swap race. Callers must re-read the
   * card inside `run` so each attempt swaps against the revision it actually saw.
   */
  protected async retryOnRevisionConflict<T>(run: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await run();
      } catch (error) {
        if (!(error instanceof TaskfoldRevisionConflictError) || attempt >= CARD_CAS_MAX_ATTEMPTS) {
          throw error;
        }
      }
    }
  }

  /**
   * Read-invert-persist compensation loop shared by {@link compensateWorkspaceMutation}
   * and store-workflow.ts's `decompose` rollback (需求/15.8-并发与补偿设计.md §4.4).
   * `before`/`after` bracket the single edit the caller wants to undo; each attempt
   * re-reads the live card, computes `invert(before, after, current)`, and swaps it
   * in with `current.revision` as the CAS guard, preserving whatever a concurrent
   * writer did to the card that `before`/`after` never touched.
   *
   * This does not call {@link enqueueMutation}: it assumes the caller either holds a
   * mutation-queue slot already (decompose, which runs entirely inside one) or takes
   * its own slot around the call (see {@link compensateWorkspaceMutation}). Wrapping
   * it here too would deadlock a caller invoking this from inside its own
   * enqueueMutation-wrapped operation, because enqueueMutation chains onto a queue
   * that will not advance until that outer operation returns. `protected`: store-
   * workflow.ts's `decompose` rollback calls this directly with
   * {@link invertTaskfoldCardMutation} for that reason -- it already runs entirely
   * inside its own enqueueMutation call.
   */
  protected async compensateCardMutation(
    id: string,
    before: TaskfoldCard,
    after: TaskfoldCard,
    invert: (before: TaskfoldCard, after: TaskfoldCard, current: TaskfoldCard) => TaskfoldCard,
  ): Promise<void> {
    for (let attempt = 1; ; attempt += 1) {
      const current = await this.get(id);
      if (!current) {
        return;
      }
      const merged = invert(before, after, current);
      if (sameTaskfoldCardState(current, merged)) {
        return;
      }
      try {
        await this.persistCard(merged, current.revision);
        return;
      } catch (error) {
        if (!(error instanceof TaskfoldRevisionConflictError) || attempt >= CARD_CAS_MAX_ATTEMPTS) {
          throw new Error(`card changed repeatedly during compensation: ${id}`);
        }
      }
    }
  }

  /**
   * Rolls back a workspace materialization that a caller (dispatcher.ts,
   * card-execution.ts) already committed via {@link update} but must now undo
   * because starting the run failed. Unlike the callers' old plain
   * `store.update(id, { workspace: ... })` rollback, this preserves any edit a
   * concurrent UI/agent write made to the card during the materialize-then-fail
   * window instead of silently overwriting it (需求/15.8-并发与补偿设计.md §2.4).
   *
   * Takes its own {@link enqueueMutation} slot: both call sites invoke this from
   * outside any store mutation of their own.
   */
  async compensateWorkspaceMutation(before: TaskfoldCard, after: TaskfoldCard): Promise<void> {
    await this.enqueueMutation(
      async () =>
        await this.compensateCardMutation(before.id, before, after, invertTaskfoldWorkspaceMutation),
    );
  }

  private async assertActiveStatusAllowed(
    existing: TaskfoldCard,
    next: TaskfoldCard,
    now: number,
  ): Promise<void> {
    if (
      next.status !== "ready" &&
      next.status !== "running" &&
      next.status !== "review" &&
      next.status !== "done"
    ) {
      return;
    }
    const parents = cardParentIds(next);
    const cards =
      parents.length > 0 ? new Map((await this.list()).map((card) => [card.id, card])) : undefined;
    if (
      parents.length > 0 &&
      !parents.every((parentId) => cards?.get(parentId)?.status === "done")
    ) {
      throw new Error("card dependencies are not done.");
    }
    if (next.status === "done") {
      return;
    }
    const scheduledAt = next.metadata?.automation?.scheduledAt;
    if ((scheduledAt && scheduledAt > now) || (existing.status === "scheduled" && !scheduledAt)) {
      throw new Error("card is scheduled for later.");
    }
  }

  async delete(id: string): Promise<{ deleted: boolean }> {
    return await this.enqueueMutation(async () => await this.deleteDirect(id));
  }

  protected async deleteDirect(id: string): Promise<{ deleted: boolean }> {
    const cardId = id.trim();
    const deleted = await this.store.delete(cardId);
    if (!deleted) {
      return { deleted: false };
    }
    for (const entry of await this.subscriptionStore.entries()) {
      if (entry.value?.version === 1 && entry.value.subscription?.cardId === cardId) {
        await this.subscriptionStore.delete(entry.key);
      }
    }
    for (const entry of await this.attachmentStore.entries()) {
      if (entry.value?.version === 1 && entry.value.attachment?.cardId === cardId) {
        await this.attachmentStore.delete(entry.key);
      }
    }
    await this.removeReferencesToCard(cardId);
    return { deleted: true };
  }

  async addComment(
    id: string,
    input: TaskfoldCommentInput,
    scope?: TaskfoldMutationScope,
  ): Promise<TaskfoldCard> {
    const now = Date.now();
    const body = normalizeBoundedString(input.body, undefined, 2000, "comment body");
    if (!body) {
      throw new Error("comment body is required.");
    }
    const comment = { id: randomUUID(), body, createdAt: now };
    return await this.updateMetadata(id, (existing) => {
      assertCanMutateClaimedCard(existing, scope);
      return {
        ...existing.metadata,
        comments: [...(existing.metadata?.comments ?? []), comment].slice(-MAX_CARD_COMMENTS),
      };
    });
  }

  async addSourceReference(
    id: string,
    input: TaskfoldSourceReferenceCreateInput,
  ): Promise<TaskfoldCard> {
    const now = Date.now();
    const label = normalizeTitle(input.label);
    const target = normalizeBoundedString(input.target, undefined, 2000, "source reference target");
    const note = normalizeBoundedString(input.note, undefined, 2000, "source reference note");
    if (!target || target.includes("\0") || target.includes("\n")) {
      throw new Error("source reference target is required and must be a single line.");
    }
    return await this.mutateSourceReferences(id, (references) => [
      ...references,
      {
        id: randomUUID(),
        label,
        target,
        position: Math.max(0, ...references.map((reference) => reference.position)) + POSITION_STEP,
        createdAt: now,
        updatedAt: now,
        ...(note ? { note } : {}),
      },
    ]);
  }

  async updateSourceReference(
    id: string,
    input: TaskfoldSourceReferenceUpdateInput,
  ): Promise<TaskfoldCard> {
    const sourceReferenceId = normalizeBoundedString(
      input.sourceReferenceId,
      undefined,
      120,
      "source reference id",
    );
    if (!sourceReferenceId) {
      throw new Error("sourceReferenceId is required.");
    }
    return await this.mutateSourceReferences(id, (references) => {
      const existing = references.find((reference) => reference.id === sourceReferenceId);
      if (!existing) {
        throw new Error(`source reference not found: ${sourceReferenceId}`);
      }
      const label =
        input.label === undefined ? existing.label : normalizeTitle(input.label);
      const target =
        input.target === undefined
          ? existing.target
          : normalizeBoundedString(input.target, undefined, 2000, "source reference target");
      const note =
        input.note === undefined
          ? existing.note
          : normalizeBoundedString(input.note, undefined, 2000, "source reference note");
      if (!target || target.includes("\0") || target.includes("\n")) {
        throw new Error("source reference target is required and must be a single line.");
      }
      return references.map((reference) => {
        if (reference.id !== sourceReferenceId) {
          return reference;
        }
        const next: TaskfoldSourceReference = {
          ...reference,
          label,
          target,
          updatedAt: Date.now(),
          ...(note ? { note } : {}),
        };
        if (!note) {
          delete next.note;
        }
        return next;
      });
    });
  }

  async deleteSourceReference(
    id: string,
    input: TaskfoldSourceReferenceDeleteInput,
  ): Promise<TaskfoldCard> {
    const sourceReferenceId = normalizeBoundedString(
      input.sourceReferenceId,
      undefined,
      120,
      "source reference id",
    );
    if (!sourceReferenceId) {
      throw new Error("sourceReferenceId is required.");
    }
    return await this.mutateSourceReferences(id, (references) => {
      if (!references.some((reference) => reference.id === sourceReferenceId)) {
        throw new Error(`source reference not found: ${sourceReferenceId}`);
      }
      return references.filter((reference) => reference.id !== sourceReferenceId);
    });
  }

  async reorderSourceReferences(
    id: string,
    input: TaskfoldSourceReferenceReorderInput,
  ): Promise<TaskfoldCard> {
    if (
      !Array.isArray(input.sourceReferenceIds) ||
      input.sourceReferenceIds.some((value) => typeof value !== "string")
    ) {
      throw new Error("sourceReferenceIds are required.");
    }
    const sourceReferenceIds = input.sourceReferenceIds as string[];
    return await this.mutateSourceReferences(id, (references) => {
      if (
        sourceReferenceIds.length !== references.length ||
        new Set(sourceReferenceIds).size !== sourceReferenceIds.length
      ) {
        throw new Error("sourceReferenceIds must contain every source reference exactly once.");
      }
      const byId = new Map(references.map((reference) => [reference.id, reference]));
      const now = Date.now();
      return sourceReferenceIds.map((sourceReferenceId, index) => {
        const reference = byId.get(sourceReferenceId);
        if (!reference) {
          throw new Error(`source reference not found: ${sourceReferenceId}`);
        }
        return {
          ...reference,
          position: (index + 1) * POSITION_STEP,
          updatedAt: now,
        };
      });
    });
  }

  private async mutateSourceReferences(
    id: string,
    mutate: (references: TaskfoldSourceReference[]) => TaskfoldSourceReference[],
  ): Promise<TaskfoldCard> {
    return await this.retryOnRevisionConflict(async () => await this.enqueueMutation(async () => {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`card not found: ${id}`);
      }
      const sourceReferences = mutate(
        [...(existing.sourceReferences ?? [])].toSorted(
          (left, right) => left.position - right.position || left.createdAt - right.createdAt,
        ),
      );
      const now = Date.now();
      const next = removeUndefinedCardFields({
        ...existing,
        ...(sourceReferences.length ? { sourceReferences } : {}),
        updatedAt: now,
      });
      if (!sourceReferences.length) {
        delete next.sourceReferences;
      }
      next.events = appendEvent(next, { kind: "edited" }, now);
      await this.persistCard(next, existing.revision);
      return next;
    }));
  }

  async addLink(id: string, input: TaskfoldLinkInput): Promise<TaskfoldCard> {
    const now = Date.now();
    const targetCardId = normalizeBoundedString(input.targetCardId, undefined, 120, "link target");
    const url = normalizeBoundedString(input.url, undefined, 2000, "link URL");
    const title = normalizeBoundedString(input.title, undefined, 180, "link title");
    if (!targetCardId && !url) {
      throw new Error("link targetCardId or url is required.");
    }
    const type = normalizeLinkType(input.type, "relates_to");
    if (type === "parent" || type === "child") {
      throw new Error("parent and child dependency links must use linkDependency.");
    }
    if (type === "contains" || type === "contained_by") {
      throw new Error("requirement hierarchy links must use setCardRequirement.");
    }
    const link: TaskfoldLink = {
      id: randomUUID(),
      type,
      createdAt: now,
      ...(targetCardId ? { targetCardId } : {}),
      ...(title ? { title } : {}),
      ...(url ? { url } : {}),
    };
    return await this.updateMetadata(id, (existing) => ({
      ...existing.metadata,
      links: appendLinkPreservingDependencies(existing.metadata?.links ?? [], link),
    }));
  }

  async linkCards(
    parentId: string,
    childId: string,
    scope?: TaskfoldMutationScope,
  ): Promise<TaskfoldCard> {
    return await this.enqueueMutation(
      async () => await this.linkCardsDirect(parentId, childId, Date.now(), { scope }),
    );
  }

  async setCardRequirement(
    childId: string,
    requirementId: string | undefined,
    scope?: TaskfoldMutationScope,
  ): Promise<TaskfoldCard> {
    return await this.enqueueMutation(
      async () => await this.setCardRequirementDirect(childId, requirementId, Date.now(), scope),
    );
  }

  protected async setCardRequirementDirect(
    childId: string,
    requirementId: string | undefined,
    now = Date.now(),
    scope?: TaskfoldMutationScope,
  ): Promise<TaskfoldCard> {
    const child = await this.get(childId);
    if (!child) {
      throw new Error(`card not found: ${childId}`);
    }
    if (isRequirementCard(child)) {
      throw new Error("requirement cards cannot be assigned to another requirement.");
    }
    const boardId = cardBoardId(child);
    if (await this.isProjectArchived(boardId)) {
      throw new Error("project is archived.");
    }
    assertCanMutateClaimedCard(child, scope);
    const currentRequirementId = cardRequirementId(child);
    const detach = async (parentId: string) => {
      const parent = await this.get(parentId);
      if (!parent) {
        return;
      }
      assertCanMutateClaimedCard(parent, scope);
      await this.updateCard(parent.id, {
        metadata: {
          ...parent.metadata,
          links: (parent.metadata?.links ?? []).filter(
            (link) => !(link.type === "contains" && link.targetCardId === child.id),
          ),
        },
      });
    };

    if (!requirementId) {
      if (!currentRequirementId) {
        return child;
      }
      await detach(currentRequirementId);
      return await this.updateCard(child.id, {
        metadata: {
          ...child.metadata,
          links: (child.metadata?.links ?? []).filter((link) => link.type !== "contained_by"),
        },
      });
    }

    const normalizedRequirementId = requirementId.trim();
    if (!normalizedRequirementId) {
      return await this.setCardRequirementDirect(child.id, undefined, now, scope);
    }
    if (normalizedRequirementId === child.id) {
      throw new Error("a card cannot be its own requirement.");
    }
    const requirement = await this.get(normalizedRequirementId);
    if (!requirement) {
      throw new Error(`card not found: ${normalizedRequirementId}`);
    }
    if (!isRequirementCard(requirement)) {
      throw new Error("target card is not a requirement.");
    }
    if (cardBoardId(requirement) !== boardId) {
      throw new Error("requirement must belong to the same project.");
    }
    if (cardRequirementId(requirement)) {
      throw new Error("nested requirements are not supported.");
    }
    assertCanMutateClaimedCard(requirement, scope);

    if (currentRequirementId && currentRequirementId !== requirement.id) {
      await detach(currentRequirementId);
    }
    const requirementLinks = requirement.metadata?.links ?? [];
    const childLinks = child.metadata?.links ?? [];
    const nextRequirementLinks = requirementLinks.some(
      (link) => link.type === "contains" && link.targetCardId === child.id,
    )
      ? requirementLinks
      : appendLinkPreservingDependencies(requirementLinks, {
          id: randomUUID(),
          type: "contains",
          targetCardId: child.id,
          createdAt: now,
        });
    const nextChildLinks = [
      ...childLinks.filter((link) => link.type !== "contained_by"),
      {
        id: randomUUID(),
        type: "contained_by" as const,
        targetCardId: requirement.id,
        createdAt: now,
      },
    ];
    await this.updateCard(requirement.id, {
      metadata: { ...requirement.metadata, links: nextRequirementLinks },
    });
    return await this.updateCard(child.id, {
      metadata: { ...child.metadata, links: nextChildLinks },
    });
  }

  protected async linkCardsDirect(
    parentId: string,
    childId: string,
    now = Date.now(),
    options: { allowStatusOnlyActiveChild?: boolean; scope?: TaskfoldMutationScope } = {},
  ): Promise<TaskfoldCard> {
    if (parentId.trim() === childId.trim()) {
      throw new Error("parent and child cards must differ.");
    }
    const parent = await this.get(parentId);
    const child = await this.get(childId);
    if (!parent) {
      throw new Error(`card not found: ${parentId}`);
    }
    if (!child) {
      throw new Error(`card not found: ${childId}`);
    }
    if (isRequirementCard(parent) || child.kind === "requirement") {
      throw new Error("requirement cards cannot be execution dependencies.");
    }
    assertCanMutateClaimedCard(parent, options.scope);
    assertCanMutateClaimedCard(child, options.scope);
    if (child.status === "done" || child.status === "blocked") {
      const cardsById = new Map((await this.list()).map((card) => [card.id, card]));
      const parentIds = [...cardParentIds(child), parent.id].filter(
        (id, index, ids) => ids.indexOf(id) === index,
      );
      if (parentIds.some((id) => cardsById.get(id)?.status !== "done")) {
        throw new Error("terminal child cards cannot gain incomplete parent dependencies.");
      }
    }
    if (isActiveDependencyTarget(child, { allowStatusOnly: options.allowStatusOnlyActiveChild })) {
      throw new Error("active child cards cannot gain parent dependencies.");
    }
    if (await this.dependsOn(parent.id, child.id)) {
      throw new Error("dependency link would create a cycle.");
    }
    const parentLinks = parent.metadata?.links ?? [];
    const childLinks = child.metadata?.links ?? [];
    const nextParentLinks = parentLinks.some(
      (link) => link.type === "child" && link.targetCardId === child.id,
    )
      ? parentLinks
      : appendLinkPreservingDependencies(parentLinks, {
          id: randomUUID(),
          type: "child" as const,
          targetCardId: child.id,
          createdAt: now,
        });
    const nextChildLinks = childLinks.some(
      (link) => link.type === "parent" && link.targetCardId === parent.id,
    )
      ? childLinks
      : appendLinkPreservingDependencies(childLinks, {
          id: randomUUID(),
          type: "parent" as const,
          targetCardId: parent.id,
          createdAt: now,
        });
    const updatedParent = await this.updateCard(parent.id, {
      metadata: { ...parent.metadata, links: nextParentLinks },
    });
    let nextChild: TaskfoldCard;
    try {
      nextChild = await this.updateCard(child.id, {
        metadata: { ...child.metadata, links: nextChildLinks },
      });
    } catch (error) {
      // The parent's half of the link already committed; undo it rather than
      // leave a one-sided link with no reciprocal on the child (需求
      // /15.8-并发与补偿设计.md §2.3/§4.4, 选做). No enqueueMutation here:
      // linkCardsDirect always runs from inside a caller's own enqueueMutation
      // call (create, decompose, or the public linkCards()).
      await this.compensateCardMutation(
        parent.id,
        parent,
        updatedParent,
        invertTaskfoldCardMutation,
      ).catch(() => undefined);
      throw error;
    }
    return await this.promoteDependencyReady(nextChild.id);
  }

  private async dependencyTargetStatus(card: TaskfoldCard, now: number): Promise<TaskfoldStatus> {
    const scheduledAt = card.metadata?.automation?.scheduledAt;
    const parents = cardParentIds(card);
    if (card.status === "scheduled" && !scheduledAt) {
      return "scheduled";
    }
    if (parents.length === 0) {
      if (scheduledAt && scheduledAt > now && isDependencyPromotableStatus(card.status)) {
        return "scheduled";
      }
      return card.status === "scheduled" ? "ready" : card.status;
    }
    const parentCards = await Promise.all(parents.map((parentId) => this.get(parentId)));
    const parentsDone = parentCards.every((parent) => parent?.status === "done");
    if (
      !parentsDone &&
      scheduledAt &&
      scheduledAt > now &&
      isDependencyPromotableStatus(card.status)
    ) {
      return "scheduled";
    }
    if (!parentsDone && isDependencyPromotableStatus(card.status)) {
      return "todo";
    }
    if (
      parentsDone &&
      scheduledAt &&
      scheduledAt > now &&
      isDependencyPromotableStatus(card.status)
    ) {
      return "scheduled";
    }
    return parentsDone && isDependencyPromotableStatus(card.status) ? "ready" : card.status;
  }

  private async dependsOn(cardId: string, targetParentId: string): Promise<boolean> {
    const cards = new Map((await this.list()).map((entry) => [entry.id, entry]));
    const seen = new Set<string>();
    const visit = (id: string): boolean => {
      if (id === targetParentId) {
        return true;
      }
      if (seen.has(id)) {
        return false;
      }
      seen.add(id);
      const card = cards.get(id);
      return Boolean(card && cardParentIds(card).some(visit));
    };
    return visit(cardId);
  }

  protected async recordDispatch(card: TaskfoldCard, now: number): Promise<TaskfoldCard> {
    const metadata = trimMetadataToBudget(
      normalizeMetadata(
        {
          ...card.metadata,
          automation: normalizeAutomation(
            {
              ...card.metadata?.automation,
              dispatchCount: (card.metadata?.automation?.dispatchCount ?? 0) + 1,
              lastDispatchAt: now,
            },
            card.metadata?.automation,
          ),
        },
        card.metadata,
      ),
    );
    const next = removeUndefinedCardFields({
      ...card,
      ...(!metadataIsEmpty(metadata) ? { metadata } : { metadata: undefined }),
      events: appendEvent(card, { kind: "dispatch" }, now),
    });
    await this.persistCard(next, card.revision);
    return next;
  }

  protected async recordOrchestrationCandidate(
    card: TaskfoldCard,
    now: number,
  ): Promise<TaskfoldCard> {
    const metadata = trimMetadataToBudget({
      ...card.metadata,
      workerLogs: [
        ...(card.metadata?.workerLogs ?? []),
        {
          id: randomUUID(),
          level: "info" as const,
          message: "Auto orchestration marked this triage card for specification or decomposition.",
          createdAt: now,
        },
      ].slice(-MAX_CARD_WORKER_LOGS),
      workerProtocol: {
        state: "idle" as const,
        updatedAt: now,
        detail: "Awaiting taskfold_specify or taskfold_decompose.",
      },
    });
    const next = removeUndefinedCardFields({
      ...card,
      ...(!metadataIsEmpty(metadata) ? { metadata } : { metadata: undefined }),
      events: appendEvent(card, { kind: "orchestration" }, now),
    });
    await this.persistCard(next, card.revision);
    return next;
  }

  protected async promoteDependencyReady(id: string, now = Date.now()): Promise<TaskfoldCard> {
    const card = await this.get(id);
    if (!card) {
      throw new Error(`card not found: ${id}`);
    }
    if (card.metadata?.archivedAt) {
      return card;
    }
    const target = await this.dependencyTargetStatus(card, now);
    if (target === card.status) {
      return card;
    }
    return await this.updateCard(card.id, { status: target });
  }
}
/* oxlint-disable max-lines -- TODO: split this grandfathered oversized file. */
