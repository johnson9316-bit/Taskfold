// Taskfold plugin entrypoint registers its OpenClaw integration.
import { definePluginEntry } from "./api.js";
import { registerTaskfoldGatewayMethods } from "./runtime-api.js";
import { createTaskfoldChangeEventService } from "./src/change-events.js";
import { registerTaskfoldCommand } from "./src/command.js";
import { cleanupTaskfoldRunWorktree } from "./src/dispatcher-workspace.js";
import { createTaskfoldReconcilerService } from "./src/reconciler.js";
import { TaskfoldStore } from "./src/store.js";
import { createTaskfoldTools } from "./src/tools.js";
import {
  guardTaskfoldToolsForWorkspaceAccess,
  TASKFOLD_TOOL_NAMES,
} from "./src/workspace-access.js";

const TASKFOLD_CLI_OPTIONS = {
  descriptors: [
    {
      name: "taskfold",
      description: "Manage Taskfold cards and worker dispatch",
      hasSubcommands: true,
    },
  ],
};

export default definePluginEntry({
  id: "taskfold",
  name: "Taskfold",
  description: "Taskfold for agent-owned issues and sessions.",
  register(api) {
    if (api.registrationMode === "cli-metadata") {
      api.registerCli(() => {}, TASKFOLD_CLI_OPTIONS);
      return;
    }

    const store = TaskfoldStore.openSqlite();
    api.session.controls.registerControlUiDescriptor({
      surface: "tab",
      id: "taskfold",
      label: "Taskfold",
      description: "Gateway-local board for agent-owned work.",
      icon: "kanban",
      group: "control",
      requiredScopes: ["operator.write"],
    });
    registerTaskfoldGatewayMethods({ api, store });
    registerTaskfoldCommand({ api, store });
    api.registerService(createTaskfoldChangeEventService(store));
    // Server-side control loop: converges card state with no browser attached, and
    // recovers runs orphaned by a Gateway restart. The hook below reports outcomes
    // for runs that end normally; the loop covers the case where this process did
    // not live long enough to receive one.
    api.registerService(createTaskfoldReconcilerService({ store, runtime: api.runtime }));
    api.on("subagent_ended", async (event) => {
      // `event.runId` is absent whenever the host never durably associated one
      // with this hook delivery; `event.targetSessionKey` is always present
      // and is `finishExecutionForRun`'s fallback identity (`session-link.ts`)
      // for a card still holding `openExecutionLaunch`'s provisional runId
      // (需求/15.7-会话生命周期设计.md §7 步骤 5) — so this must run either way,
      // not only when `event.runId` is present.
      await store.finishExecutionForRun(event.runId, {
        outcome: event.outcome,
        endedAt: event.endedAt,
        reason: event.error ?? event.reason,
        targetSessionKey: event.targetSessionKey,
      });
      await cleanupTaskfoldRunWorktree({
        store,
        worktrees: api.runtime.worktrees,
        runId: event.runId,
        targetSessionKey: event.targetSessionKey,
      });
    });
    api.registerCli(
      async ({ program }) => {
        const { registerTaskfoldCli } = await import("./src/cli.js");
        registerTaskfoldCli({ program, store });
      },
      TASKFOLD_CLI_OPTIONS,
    );
    api.registerTool(
      (context) =>
        guardTaskfoldToolsForWorkspaceAccess(
          createTaskfoldTools({ api, context, store }),
          context,
          undefined,
        ),
      {
        names: [...TASKFOLD_TOOL_NAMES],
        optional: true,
      },
    );
  },
});
