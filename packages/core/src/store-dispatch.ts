// Taskfold core：派发与批量操作层（需求/18 §3.2：store.ts 的 dispatch() 等原样搬进 core）。
// 原先写在 OpenClaw 适配层 packages/openclaw/src/backend/src/store.ts 的 TaskfoldStore 里，靠继承直接用 core 的
// protected 内部方法；TASK-6 搬到这里，适配层只留工厂方法。CLI 仍只用 TaskfoldProjectStore，
// 不暴露这些执行相关的方法。
import { randomUUID } from "node:crypto";
import type { TaskfoldAttachment, TaskfoldCard } from "./contract/index.js";
import {
  cardBoardId,
  closeRunningAttempts,
  computeCardDiagnostics,
  isDependencyPromotableStatus,
  latestRunningAttempt,
  mergeDiagnostics,
  removeUndefinedCardFields,
  retryBudgetExhausted,
} from "./store-card-helpers.js";
import { buildWorkerContext } from "./worker-prompt.js";
import {
  isTaskfoldClaimReclaimable,
  MAX_CARD_NOTIFICATIONS,
  secondsToDurationMs,
} from "./store-constants.js";
import { TaskfoldRevisionConflictError } from "./store-core.js";
import type {
  TaskfoldBulkInput,
  TaskfoldCardPatch,
  TaskfoldDiagnosticsResult,
  TaskfoldDispatchOptions,
  TaskfoldDispatchResult,
} from "./store-inputs.js";
import {
  metadataIsEmpty,
  normalizeBoardId,
  normalizeTimestamp,
  trimMetadataToBudget,
} from "./store-normalizers.js";
import { TaskfoldProjectStore } from "./store-projects.js";

// Capability layers split review boundaries only; the core still owns persistence and mutation order.
export class TaskfoldDispatchStore extends TaskfoldProjectStore {
  private async shouldAutoOrchestrate(card: TaskfoldCard): Promise<boolean> {
    if (
      card.status !== "triage" ||
      card.metadata?.archivedAt ||
      card.metadata?.workerProtocol?.state === "idle"
    ) {
      return false;
    }
    const board = await this.boardStore.lookup(cardBoardId(card));
    return board?.version === 1 && board.board.orchestration?.autoDecompose === true;
  }

  async dispatch(
    input: number | TaskfoldDispatchOptions = Date.now(),
  ): Promise<TaskfoldDispatchResult> {
    const now = typeof input === "number" ? input : normalizeTimestamp(input.now, Date.now());
    const boardId = typeof input === "number" ? undefined : normalizeBoardId(input.boardId);
    return await this.enqueueMutation(async () => {
      const promoted: TaskfoldCard[] = [];
      const reclaimed: TaskfoldCard[] = [];
      const blocked: TaskfoldCard[] = [];
      const orchestrated: TaskfoldCard[] = [];
      const orchestratedByBoard = new Map<string, number>();
      for (const card of await this.list({ boardId })) {
        // 一张卡的某次写输给并发写入（别的进程、CLI）就跳过这张卡，留给下一轮派发按最新
        // 状态重判；不中断整轮，也不在这里重试（TASK-6）。
        try {
          if (await this.isProjectArchived(cardBoardId(card))) {
            continue;
          }
          // Archived cards remain readable and restorable, but must never re-enter automation.
          if (card.metadata?.archivedAt) {
            continue;
          }
          let latest = await this.promoteDependencyReady(card.id, now);
          const wasPromoted = latest.status !== card.status;
          const claim = latest.metadata?.claim;
          const latestAttempt = latestRunningAttempt(latest);
          const maxRuntimeSeconds = latest.metadata?.automation?.maxRuntimeSeconds;
          const runtimeStartedAt = latestAttempt?.startedAt ?? claim?.claimedAt ?? latest.startedAt;
          const timedOut =
            Boolean(maxRuntimeSeconds && runtimeStartedAt) &&
            now - runtimeStartedAt! > secondsToDurationMs(maxRuntimeSeconds!);
          const claimExpired = isTaskfoldClaimReclaimable(claim, now);
          const retriesExhausted = retryBudgetExhausted(latest);
          if (latest.status === "running" && (timedOut || claimExpired)) {
            const reason = timedOut
              ? "Run exceeded the card max runtime."
              : "Claim expired without a recent heartbeat.";
            const execution =
              latest.execution?.status === "running"
                ? { ...latest.execution, status: "blocked" as const, updatedAt: now }
                : latest.execution;
            latest = await this.updateCard(latest.id, {
              status: "blocked",
              ...(execution ? { execution } : {}),
              metadata: {
                ...latest.metadata,
                claim: undefined,
                attempts: closeRunningAttempts(latest.metadata?.attempts, now, "blocked", reason),
                failureCount: (latest.metadata?.failureCount ?? 0) + 1,
                notifications: [
                  ...(latest.metadata?.notifications ?? []),
                  {
                    id: randomUUID(),
                    kind: "failed" as const,
                    createdAt: now,
                    sequence: this.nextNotificationSequence(now),
                    message: reason,
                  },
                ].slice(-MAX_CARD_NOTIFICATIONS),
              },
            }, { expectedRevision: latest.revision });
            blocked.push(latest);
          } else if (claimExpired) {
            latest = await this.updateCard(latest.id, {
              metadata: { ...latest.metadata, claim: undefined },
            }, { expectedRevision: latest.revision });
            reclaimed.push(latest);
          }
          if (
            !latest.metadata?.claim &&
            retriesExhausted &&
            isDependencyPromotableStatus(latest.status)
          ) {
            latest = await this.updateCard(latest.id, {
              status: "blocked",
              metadata: {
                ...latest.metadata,
                notifications: [
                  ...(latest.metadata?.notifications ?? []),
                  {
                    id: randomUUID(),
                    kind: "failed" as const,
                    createdAt: now,
                    sequence: this.nextNotificationSequence(now),
                    message: "Card exhausted its retry budget.",
                  },
                ].slice(-MAX_CARD_NOTIFICATIONS),
              },
            }, { expectedRevision: latest.revision });
            blocked.push(latest);
          }
          if (latest.status === "ready" && !latest.metadata?.archivedAt) {
            latest = await this.recordDispatch(latest, now);
          }
          if (await this.shouldAutoOrchestrate(latest)) {
            const latestBoardId = cardBoardId(latest);
            const board = await this.boardStore.lookup(latestBoardId);
            const cap = board?.board.orchestration?.autoDecomposePerDispatch ?? 3;
            const boardCount = orchestratedByBoard.get(latestBoardId) ?? 0;
            if (boardCount < cap) {
              latest = await this.recordOrchestrationCandidate(latest, now);
              orchestrated.push(latest);
              orchestratedByBoard.set(latestBoardId, boardCount + 1);
            }
          }
          if (wasPromoted && latest.status !== "blocked") {
            promoted.push(latest);
          }
        } catch (error) {
          if (error instanceof TaskfoldRevisionConflictError) {
            continue;
          }
          throw error;
        }
      }
      return {
        promoted,
        reclaimed,
        blocked,
        orchestrated,
        count: promoted.length + reclaimed.length + blocked.length + orchestrated.length,
      };
    });
  }

  async bulkUpdate(input: TaskfoldBulkInput): Promise<{ cards: TaskfoldCard[] }> {
    const ids = Array.isArray(input.ids)
      ? input.ids.filter((id): id is string => typeof id === "string" && id.trim() !== "")
      : [];
    if (ids.length === 0) {
      throw new Error("ids are required.");
    }
    const patch =
      input.patch && typeof input.patch === "object" && !Array.isArray(input.patch)
        ? (input.patch as TaskfoldCardPatch)
        : {};
    const cards: TaskfoldCard[] = [];
    for (const id of ids) {
      const updated =
        input.archived === undefined
          ? await this.update(id, patch)
          : await this.archive(id, input.archived);
      cards.push(updated);
    }
    return { cards };
  }

  async archive(id: string, archived: unknown): Promise<TaskfoldCard> {
    const shouldArchive = archived !== false;
    return await this.updateMetadata(id, (existing) => ({
      ...existing.metadata,
      archivedAt: shouldArchive ? Date.now() : 0,
    }));
  }

  async exportCards(): Promise<{
    cards: TaskfoldCard[];
    attachments: TaskfoldAttachment[];
    exportedAt: number;
  }> {
    const cards = await this.list();
    const attachments = cards.flatMap((card) => card.metadata?.attachments ?? []);
    return { cards, attachments, exportedAt: Date.now() };
  }

  async diagnostics(now = Date.now()): Promise<TaskfoldDiagnosticsResult> {
    const cards = await this.list();
    const rows = cards.flatMap((card) => {
      const diagnostics = computeCardDiagnostics(card, now);
      return diagnostics.length ? [{ card, diagnostics }] : [];
    });
    return {
      diagnostics: rows,
      count: rows.reduce((total, row) => total + row.diagnostics.length, 0),
    };
  }

  async refreshDiagnostics(now = Date.now()): Promise<TaskfoldDiagnosticsResult> {
    return await this.enqueueMutation(async () => {
      const cards = await this.list();
      const rows: TaskfoldDiagnosticsResult["diagnostics"] = [];
      for (const card of cards) {
        const latest = await this.get(card.id);
        if (!latest || latest.metadata?.archivedAt) {
          continue;
        }
        const diagnostics = mergeDiagnostics(
          latest.metadata?.diagnostics,
          computeCardDiagnostics(latest, now),
        );
        if (diagnostics.length === 0 && !latest.metadata?.diagnostics?.length) {
          continue;
        }
        const metadata = trimMetadataToBudget({ ...latest.metadata, diagnostics });
        const next = removeUndefinedCardFields({
          ...latest,
          metadata: metadataIsEmpty(metadata) ? undefined : metadata,
        });
        // 以读到的 revision 做 CAS；多卡操作不自动重试，冲突照常抛出（TASK-6）。
        await this.persistCard(next, latest.revision);
        if (diagnostics.length > 0) {
          rows.push({ card: next, diagnostics });
        }
      }
      return {
        diagnostics: rows,
        count: rows.reduce((total, row) => total + row.diagnostics.length, 0),
      };
    });
  }

  async buildWorkerContext(id: string): Promise<string> {
    const card = await this.get(id);
    if (!card) {
      throw new Error(`card not found: ${id}`);
    }
    return buildWorkerContext(card, await this.list());
  }
}
