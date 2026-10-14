import type { TaskfoldCard } from "@taskfold/core/contract/index.js";
import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import type { AgentToolResult } from "openclaw/plugin-sdk/tool-results";
import { Type } from "typebox";
import type { TaskfoldMutationScope } from "@taskfold/core/store-inputs.js";
import type { TaskfoldStore } from "./store.js";

type ScopedMoveParams = {
  record: Record<string, unknown>;
  id: string;
  scope: TaskfoldMutationScope;
};

const ClaimTokenFieldName = "token" as const;

export function cardIdField() {
  return Type.String({ description: "Taskfold card id." });
}

export function claimTokenField(description = "Claim token returned by taskfold_claim.") {
  return Type.Optional(Type.String({ description }));
}

export function createTaskfoldMoveTool(params: {
  store: TaskfoldStore;
  readScopedCardToolParams: (rawParams: unknown) => Promise<ScopedMoveParams>;
  redactedCardResult: (card: TaskfoldCard) => AgentToolResult<{ card: TaskfoldCard }>;
}): AnyAgentTool {
  return {
    name: "taskfold_move",
    label: "Taskfold Move",
    description:
      "Move a Taskfold card to another status. Claimed cards require matching claim scope.",
    parameters: Type.Object(
      {
        id: cardIdField(),
        status: Type.String({
          minLength: 1,
          description:
            "Target status id in the card's project (default statuses: todo, running, review, done, cancelled; " +
            "projects can define their own). The old ready (queue the card for dispatch) and blocked (mark it " +
            "blocked) are still accepted.",
        }),
        [ClaimTokenFieldName]: claimTokenField("Claim token for claimed cards."),
      },
      { additionalProperties: false },
    ),
    execute: async (_toolCallId, rawParams) => {
      const { record, id, scope } = await params.readScopedCardToolParams(rawParams);
      return params.redactedCardResult(
        await params.store.move(id, record.status, undefined, scope),
      );
    },
  };
}
