// Taskfold host type bridge for `TaskRunView`.
//
// openclaw@2026.9.4 removed the bare `openclaw/plugin-sdk` export entirely —
// `node_modules/openclaw/package.json`'s `exports` map has no `"./plugin-sdk"` key
// at all any more (not even one missing `types`, unlike the subpaths shimmed in
// `openclaw-plugin-sdk-shims.d.ts`). That barrel used to re-export the task/subagent
// type family, including `TaskRunView`.
//
// The type itself is still defined host-side — as of 2026.9.4 at
// `node_modules/openclaw/dist/agent-harness-runtime-CZb40n5o.d.ts:19586`
// (`type TaskRunView = { ... }`, filename hash will drift with future releases,
// search for "type TaskRunView =" to relocate it) — but no public subpath names it
// directly any more.
//
// `PluginRuntime` *is* still exported from `openclaw/plugin-sdk/plugin-runtime`
// (Taskfold already depends on it — see dispatcher.ts, card-execution.ts,
// reconciler.ts), and its `tasks.runs` surface is typed in terms of `TaskRunView`:
//   tasks: { runs: PluginRuntimeTaskRuns; ... }
//   PluginRuntimeTaskRuns.bindSession(...) => BoundTaskRunsRuntime
//   BoundTaskRunsRuntime.list: () => TaskRunView[]
// so the shape can be recovered by type extraction instead of hand-copied. This
// keeps the type sourced from the host's own type graph: an upstream shape or
// vocabulary change still propagates here and fails the build, rather than going
// silently stale the way a hand-transcribed copy would.
//
// Delete this file (and point test/host-contract.test.ts's import back at
// `openclaw/plugin-sdk`) once upstream restores a public export for this type.
import type { PluginRuntime } from "openclaw/plugin-sdk/plugin-runtime";

type BoundTaskRuns = ReturnType<PluginRuntime["tasks"]["runs"]["bindSession"]>;

/** Recovered from `BoundTaskRunsRuntime.list(): TaskRunView[]` in the host's own types. */
export type TaskRunView = ReturnType<BoundTaskRuns["list"]>[number];
