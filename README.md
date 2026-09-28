# Taskfold

Taskfold is an OpenClaw plugin for planning and running work across projects.
It combines project milestones, a lightweight document reader, delivery facts,
and OpenClaw-managed worktree execution in one board.

English is the primary project language. The Control UI supports English and
Simplified Chinese.

## What It Provides

- Projects with milestone columns, including a permanent **Unassigned** column.
- Cards whose board placement is separate from their execution status.
- Card delivery records for development, validation, release, and source
  references. A completed card never implies that validation or release happened.
- A project document library that securely renders explicitly registered
  Markdown files without indexing project directories or storing file contents.
- OpenClaw-native card execution in managed Git worktrees: prompt preview,
  start confirmation, run inspection, steering, abort, and a link to the
  native Chat session.
- OpenClaw CLI commands, slash commands, tools, and Gateway RPC methods under
  the isolated `taskfold` namespace.
- Independent English/Simplified Chinese UI language preference, while still
  inheriting the host Control UI theme.

## How State Converges

Runs that end normally report their outcome through the Gateway's
`subagent_ended` event. Anything that event cannot cover — most importantly a
Gateway that restarts mid-run — is picked up by a **Gateway-side reconciler**
service, which sweeps active cards on a timer and once at startup. A run that
stops heartbeating well past its grace window is presumed gone and closed out
instead of sitting at `running` forever, and a card whose execution already
recorded an outcome is moved to match it. Card state therefore converges whether
or not anyone has the board open, and the Control UI is a pure observer: it reads
state and never writes lifecycle status.

The reconciler judges liveness from the card's own claim heartbeat rather than by
asking the host, because a third-party plugin cannot read host run state after the
fact: `runtime.gateway.request` is restricted to bundled and trusted-official
plugins, task records are scoped to the requester session rather than the card's,
and `subagent.waitForRun` cannot distinguish a finished run from a forgotten one.

Admission decisions — claiming a card, starting a run — commit through a database
compare-and-swap on a monotonic card `revision`, so a card cannot be claimed
twice even by two Gateway processes sharing one database.

Idle UI refresh waits on the `taskfold.changes.wait` long-wait RPC instead of
polling `cards.list`. Its cursor is scoped to the database and advances
monotonically across restarts, so restarting the Gateway does not invalidate a
connected client's cursor.

## Requirements

- OpenClaw `>=2026.7.1 <2027.0.0`
- Node.js `>=22`
- The Control UI **Custom plugin UI** Labs setting enabled (see
  [Control UI Security](#control-ui-security))

Taskfold runs inside the same Gateway as the Control UI. It does not start a
separate web server.

## Install

After the package is published, install the scoped package from ClawHub:

```bash
openclaw plugins install clawhub:@johnson9316-bit/taskfold
openclaw plugins enable taskfold
openclaw gateway restart
```

Open the **Taskfold** tab from the OpenClaw Control UI after the Gateway has
restarted.

ClawHub/npm is the only supported install channel: the repository is an npm
workspaces monorepo and the publishable plugin lives in `packages/openclaw`,
but OpenClaw's `git:` install source clones the repository root and treats
it as the plugin directory with no way to point at a subdirectory, so
`openclaw plugins install git:...` against this repository no longer works.
See [docs/CLAW_HUB_PUBLISHING.md](docs/CLAW_HUB_PUBLISHING.md) for details.

## Control UI Security

Taskfold's panel is a native Control UI module: the Gateway loads it directly
into the Control UI shell, not through an iframe. Loading native browser code
from any user-installed plugin requires the Gateway's **Custom plugin UI**
Labs setting, which defaults to off:

```json5
{
  gateway: {
    controlUi: {
      experimental: { customPlugins: true },
    },
  },
}
```

Toggle it from **Settings → Agents & Tools → Labs → Custom plugin UI** in the
Control UI, or set `gateway.controlUi.experimental.customPlugins` directly.
Either way, restart the Gateway and reload any already-open Control UI browser
tabs afterward; a tab loaded before the change keeps running without the
panel.

This gate is not specific to Taskfold: it governs native browser code from
*every* user-installed plugin, and native UI shipped with enabled bundled
plugins (such as Workboard) stays available regardless of it. It only gates
the browser panel — turning it off does not uninstall Taskfold or affect its
backend; its tools, CLI commands, and Gateway RPC methods keep working
normally either way.

## Data and Execution

Taskfold stores project cards and documents under each repository's main checkout:

```text
<repo>/.taskfold/
```

The OpenClaw project registry remains under `OPENCLAW_STATE_DIR/plugins/taskfold/`.
The old `taskfold.sqlite` is retained as a migration backup; it is no longer the
runtime store. Taskfold uses its own commands, tools, and RPC methods. The bundled
OpenClaw Workboard can remain enabled.

### Markdown Storage

Taskfold sits between two tools that each cover half of this problem. OpenClaw's
Workboard supplies the execution side — managed worktrees, subagent dispatch,
claim and reconciliation — while keeping its state in a database. Backlog.md
keeps tasks as plain Markdown in the repository, readable and diffable next to
the code, but has no execution layer.

Taskfold keeps execution orchestration and stores cards as Markdown under
`<repo>/.taskfold/`. The file format draws on Backlog.md, but its CLI does not
operate on Taskfold cards. `.taskfold/.runtime/` and `.taskfold/.locks/` stay out
of Git. Project-local paths saved in cards and documents use `./` relative to
the main checkout; existing absolute paths remain readable.

Milestone files use their titles (for example, `File Storage Migration.md`) and
follow title changes. Duplicate filenames receive a short UUID suffix. Milestones
no longer receive `M-<number>` display IDs; card display IDs are unchanged. Format
version 2 keeps UUID-based associations and reads legacy milestone files. Upgrade
all clients (OpenClaw plugin, CLI, and VS Code extension) before writing version 2:
older clients reject writes and cannot fully read the new milestone format.

From a development checkout, preview an existing project's milestone migration with
`node scripts/migrate-milestone-names.mjs --repo /path/to/project`. Stop writers before
applying it with `--apply --backup-dir /path/outside/project/backups`; the script
backs up milestones, cards, and configuration and verifies that associations and
content remain unchanged. Reads alone do not migrate legacy milestones.

The design is in `需求/16-文件存储改造.md` and `需求/18-多宿主架构.md` (Chinese).

### Migrating Existing SQLite Data

For an existing Taskfold SQLite installation, stop the Gateway, then run
`openclaw taskfold migrate-sqlite --dry-run` and
`openclaw taskfold migrate-sqlite --apply`. The apply command backs up the
Taskfold SQLite files before writing project data. Start the Gateway after the
migration. Flowboard's historical database is not modified.

When a card starts OpenClaw-native execution, Taskfold only supports a
managed Git worktree. It does not fall back to running directly in the primary
checkout. Stopping an execution preserves the card's business status and does
not automatically infer delivery, validation, or release facts.

## Standalone CLI

`packages/cli` builds a standalone `taskfold` command that reads and writes the cards in a
repository's `.taskfold/` directory without OpenClaw or the Gateway. It is the write path
for AI agents: `--json` output with a versioned schema, stable error codes on stderr, and
`taskfold guidelines` to add a short usage block to `AGENTS.md` / `CLAUDE.md`.
The CLI, VS Code extension, and OpenClaw plugin now read the same files.

```bash
npm run build:cli
node packages/cli/dist/taskfold.js init
node packages/cli/dist/taskfold.js --help
```

WSL drvfs paths (`/mnt/c/...`) and `\\wsl$` paths are not supported: file locks there are
misreported as compromised. See [packages/cli/README.md](packages/cli/README.md) for the
commands and the output contract.

## VS Code Extension

`packages/vscode` is a VS Code extension that opens the same board in an editor tab for the
repositories in your workspace. Like the CLI it works on `.taskfold/` directly, without
OpenClaw or the Gateway. Cards are editable, and every write, including drag and drop, is
checked against the revision the board last read. A conflict offers Reload, Overwrite or
View Diff. The document library also supports project Markdown documents. Build a
self-contained `.vsix` and install it:

```bash
npm run package -w packages/vscode
code --install-extension packages/vscode/taskfold-0.2.0.vsix
```

Then run **Taskfold: Open Board**. See [packages/vscode/README.md](packages/vscode/README.md).

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
npm run check:public-names
npm run pack:check
```

The repository is an npm workspaces monorepo. The OpenClaw plugin package is
`packages/openclaw`; the board UI it shares with the VS Code extension is
`packages/ui`. Run the commands above from the repository root.

For local Gateway testing, link the plugin package directory:

```bash
openclaw plugins install --link /path/to/Taskfold/packages/openclaw
openclaw plugins enable taskfold
openclaw gateway restart
openclaw plugins inspect taskfold --runtime
openclaw plugins doctor
```

After changing `packages/ui` sources, rebuild the Control UI bundle and reload
it in the running Gateway without a full restart:

```bash
npm run build:control-ui
openclaw gateway call plugins.controlUi.reload --params '{"pluginId":"taskfold"}'
```

## Release and Publishing

The ClawHub package identity is `@johnson9316-bit/taskfold`; the scoped name is
intentional so it remains distinct from unrelated packages.

The release procedure, validation steps, and trusted-publisher handoff are
recorded in [docs/CLAW_HUB_PUBLISHING.md](docs/CLAW_HUB_PUBLISHING.md).

## License and Attribution

Taskfold is distributed under the [MIT License](LICENSE). It began from an
imported OpenClaw Workboard baseline and has since diverged; that provenance is
recorded in [UPSTREAM.md](UPSTREAM.md) and attribution in
[THIRD-PARTY-NOTICES](THIRD-PARTY-NOTICES). Taskfold is not synchronized with
upstream.
