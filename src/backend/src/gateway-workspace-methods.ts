import type { TaskfoldCard } from "@taskfold/core/contract/index.js";
// Taskfold Gateway methods that can persist workspace-bearing card metadata.
import type { OpenClawPluginApi } from "../api.js";
import {
  readId,
  readPatch,
  resolveGatewayTaskfoldWorkspaceAccess,
  respondConflict,
  respondError,
  withoutTaskfoldCasParams,
  type GatewayMethodContext,
} from "./gateway-helpers.js";
import { TaskfoldRevisionConflictError } from "@taskfold/core/store-core.js";
import type { TaskfoldStore } from "./store.js";
import {
  assertTaskfoldWorkspaceMutationAccess,
  canonicalizeTaskfoldWorkspaceAccess,
  containsTaskfoldWorkspaceMutation,
  withTaskfoldDecomposeWorkspaceAccess,
  withTaskfoldWorkspaceAccess,
  withoutTaskfoldWorkspaceAccess,
  type TaskfoldWorkspaceAccess,
} from "./workspace-access.js";

const WRITE_SCOPE = "operator.write" as const;

// CAS guard for taskfold.cards.update: unset means keep the existing
// last-writer-wins behavior; set means store.update() rejects a stale write.
function readOptionalExpectedRevision(requestParams: Record<string, unknown>): number | undefined {
  const value = requestParams.expectedRevision;
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("expectedRevision must be a non-negative safe integer.");
  }
  return value;
}

async function resolveGatewayWorkspaceMutationAccess(
  request: GatewayMethodContext,
  value: unknown,
): Promise<TaskfoldWorkspaceAccess> {
  const access = await canonicalizeTaskfoldWorkspaceAccess(
    resolveGatewayTaskfoldWorkspaceAccess({
      context: request.context,
      client: request.client,
    }),
  );
  await assertTaskfoldWorkspaceMutationAccess(value, access);
  return access;
}

type WorkspaceGatewayMethodParams = {
  api: OpenClawPluginApi;
  store: TaskfoldStore;
  redactCard: (card: TaskfoldCard) => TaskfoldCard;
};

export function registerTaskfoldWorkspaceCardMethods(params: WorkspaceGatewayMethodParams): void {
  const { api, store, redactCard } = params;
  api.registerGatewayMethod(
    "taskfold.cards.create",
    async (request) => {
      const { params: requestParams, respond } = request;
      try {
        const input = withoutTaskfoldWorkspaceAccess(requestParams);
        const project = await store.getProject(input.boardId);
        const inputWithProjectWorkspace =
          input.workspace === undefined && project.board.defaultWorkspace
            ? { ...input, workspace: project.board.defaultWorkspace }
            : input;
        const access = await resolveGatewayWorkspaceMutationAccess(request, inputWithProjectWorkspace);
        respond(true, {
          card: redactCard(
            await store.create(withTaskfoldWorkspaceAccess(inputWithProjectWorkspace, access)),
          ),
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE },
  );

  api.registerGatewayMethod(
    "taskfold.cards.captureSession",
    async (request) => {
      const { params: requestParams, respond } = request;
      try {
        const input = withoutTaskfoldWorkspaceAccess(requestParams);
        const project = await store.getProject(input.boardId);
        const inputWithProjectWorkspace =
          input.workspace === undefined && project.board.defaultWorkspace
            ? { ...input, workspace: project.board.defaultWorkspace }
            : input;
        const access = await resolveGatewayWorkspaceMutationAccess(request, inputWithProjectWorkspace);
        respond(true, {
          card: redactCard(
            await store.captureSession(withTaskfoldWorkspaceAccess(inputWithProjectWorkspace, access)),
          ),
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE },
  );

  api.registerGatewayMethod(
    "taskfold.cards.update",
    async (request) => {
      const { params: requestParams, respond } = request;
      try {
        const id = readId(requestParams);
        const expectedRevision = readOptionalExpectedRevision(requestParams);
        const patch = withoutTaskfoldCasParams(withoutTaskfoldWorkspaceAccess(readPatch(requestParams)));
        const access = await resolveGatewayWorkspaceMutationAccess(request, patch);
        let updated;
        try {
          updated = await store.update(
            id,
            containsTaskfoldWorkspaceMutation(patch)
              ? withTaskfoldWorkspaceAccess(patch, access)
              : patch,
            expectedRevision !== undefined ? { expectedRevision } : {},
          );
        } catch (error) {
          if (error instanceof TaskfoldRevisionConflictError) {
            const current = await store.get(id);
            if (current) {
              respondConflict(respond, redactCard(current));
              return;
            }
          }
          throw error;
        }
        respond(true, { card: redactCard(updated) });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE },
  );
}

export function registerTaskfoldWorkspaceBulkMethod(params: WorkspaceGatewayMethodParams): void {
  const { api, store, redactCard } = params;
  api.registerGatewayMethod(
    "taskfold.cards.bulk",
    async (request) => {
      const { params: requestParams, respond } = request;
      try {
        const sanitizedParams = withoutTaskfoldWorkspaceAccess(requestParams);
        const patch = withoutTaskfoldWorkspaceAccess(readPatch(requestParams));
        const access = await resolveGatewayWorkspaceMutationAccess(request, patch);
        const result = await store.bulkUpdate({
          ...sanitizedParams,
          patch: containsTaskfoldWorkspaceMutation(patch)
            ? withTaskfoldWorkspaceAccess(patch, access)
            : patch,
        });
        respond(true, { cards: result.cards.map(redactCard) });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE },
  );
}

export function registerTaskfoldWorkspaceBoardMethod(params: WorkspaceGatewayMethodParams): void {
  const { api, store } = params;
  api.registerGatewayMethod(
    "taskfold.boards.upsert",
    async (request) => {
      const { params: requestParams, respond } = request;
      try {
        await resolveGatewayWorkspaceMutationAccess(request, requestParams);
        respond(true, { board: await store.upsertBoard(requestParams) });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE },
  );
}

export function registerTaskfoldWorkspaceWorkflowMethods(
  params: WorkspaceGatewayMethodParams,
): void {
  const { api, store, redactCard } = params;
  api.registerGatewayMethod(
    "taskfold.cards.specify",
    async (request) => {
      const { params: requestParams, respond } = request;
      try {
        const sanitizedParams = withoutTaskfoldWorkspaceAccess(requestParams);
        const access = await resolveGatewayWorkspaceMutationAccess(request, sanitizedParams);
        const input = containsTaskfoldWorkspaceMutation(sanitizedParams)
          ? withTaskfoldWorkspaceAccess(sanitizedParams, access)
          : sanitizedParams;
        respond(true, {
          card: redactCard(await store.specify(readId(requestParams), input, null)),
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE },
  );

  api.registerGatewayMethod(
    "taskfold.cards.decompose",
    async (request) => {
      const { params: requestParams, respond } = request;
      try {
        const sanitizedParams = withoutTaskfoldWorkspaceAccess(requestParams);
        const access = await resolveGatewayWorkspaceMutationAccess(request, sanitizedParams);
        const result = await store.decompose(
          readId(requestParams),
          withTaskfoldDecomposeWorkspaceAccess(sanitizedParams, access),
          null,
        );
        respond(true, {
          parent: redactCard(result.parent),
          children: result.children.map(redactCard),
        });
      } catch (error) {
        respondError(respond, error);
      }
    },
    { scope: WRITE_SCOPE },
  );
}
