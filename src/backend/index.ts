// Taskfold plugin entrypoint registers its OpenClaw integration.
import { resolveTaskfoldPluginDir } from "@taskfold/core/file-store.js";
import { resolveStateDir } from "openclaw/plugin-sdk/state-paths";
import { definePluginEntry } from "./api.js";
import { registerTaskfoldGatewayMethods } from "./runtime-api.js";
import { createTaskfoldChangeEventService } from "./src/change-events.js";
import { registerTaskfoldCommand } from "./src/command.js";
import { cleanupTaskfoldRunWorktree } from "./src/dispatcher-workspace.js";
import { createTaskfoldProjectRoutedStores } from "./src/project-routed-stores.js";
import { createTaskfoldReconcilerService } from "./src/reconciler.js";
import { createTaskfoldSqliteMigrationCheckService } from "./src/sqlite-migration-check.js";
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

    // TASK-10：生产存储是文件。各项目数据在自己仓库主 checkout 的 `.taskfold/`（没绑仓库的在
    // `<pluginDir>/projects/<id>/`），项目注册表与通知订阅在 `<pluginDir>/`（project-routed-stores.ts）。
    const pluginDir = resolveTaskfoldPluginDir(resolveStateDir(process.env));
    const store = TaskfoldStore.fromStores(
      createTaskfoldProjectRoutedStores({ pluginDir, warn: (message) => api.logger.warn(message) }),
    );
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
    api.registerService(createTaskfoldSqliteMigrationCheckService(pluginDir));
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
        registerTaskfoldCli({ program, store, pluginDir });
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
