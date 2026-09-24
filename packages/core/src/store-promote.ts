import { randomUUID } from "node:crypto";
import type { TaskfoldCard } from "./contract/index.js";
import { assertCanMutateClaimedCard } from "./store-card-helpers.js";
import { MAX_CARD_COMMENTS } from "./store-constants.js";
import { TaskfoldEnrichmentStore } from "./store-enrichment.js";
import type { TaskfoldMutationScope, TaskfoldPromoteInput } from "./store-inputs.js";
import { clearDiagnostics, normalizeBoundedString } from "./store-normalizers.js";

export class TaskfoldPromoteStore extends TaskfoldEnrichmentStore {
  async promoteReady(now = Date.now()): Promise<{ cards: TaskfoldCard[]; count: number }> {
    return await this.enqueueMutation(async () => {
      const promoted: TaskfoldCard[] = [];
      for (const card of await this.list()) {
        const next = await this.promoteDependencyReady(card.id, now);
        if (next.status !== card.status) {
          promoted.push(next);
        }
      }
      return { cards: promoted, count: promoted.length };
    });
  }

  /**
   * 改卡片状态。`options.expectedRevision`（TASK-8，VS Code 看板的拖拽 CAS）：给了就只在卡片
   * 仍是这个 revision 时写入，否则抛 {@link TaskfoldRevisionConflictError}、不重试；不给时
   * 行为与原来逐字相同（以刚读到的 revision 做 CAS，输给并发写入就重读重试）。
   */
  async move(
    id: string,
    status: unknown,
    position: unknown,
    scope?: TaskfoldMutationScope,
    options: { expectedRevision?: number } = {},
  ): Promise<TaskfoldCard> {
    const run = async () => await this.enqueueMutation(async () => {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`card not found: ${id}`);
      }
      // Operator surfaces omit scope and may override claims. Agent tools pass scope so a
      // worker cannot move another worker's claimed card between the preflight and this write.
      assertCanMutateClaimedCard(existing, scope);
      return await this.updateCard(
        id,
        { status },
        {
          allowMetadataDependencyLinks: false,
          enforceStatusHolds: true,
          expectedRevision: options.expectedRevision ?? existing.revision,
        },
      );
    });
    return options.expectedRevision !== undefined ? await run() : await this.retryOnRevisionConflict(run);
  }

  async promote(
    id: string,
    input: TaskfoldPromoteInput = {},
    scope?: TaskfoldMutationScope | null,
  ): Promise<TaskfoldCard> {
    return await this.retryOnRevisionConflict(async () => await this.enqueueMutation(async () => {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error(`card not found: ${id}`);
      }
      assertCanMutateClaimedCard(existing, scope === null ? undefined : scope);
      const reason = normalizeBoundedString(input.reason, undefined, 1000, "promote reason");
      const comments = reason
        ? [
            ...(existing.metadata?.comments ?? []),
            { id: randomUUID(), body: reason, createdAt: Date.now() },
          ].slice(-MAX_CARD_COMMENTS)
        : existing.metadata?.comments;
      return await this.updateCard(
        id,
        {
          status: "ready",
          metadata: {
            ...clearDiagnostics(existing.metadata, ["stranded_ready", "blocked_too_long"]),
            comments,
            stale: null,
          },
        },
        { enforceStatusHolds: input.force !== true, expectedRevision: existing.revision },
      );
    }));
  }
}
