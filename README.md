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

### From ClawHub

After the package is published, install the scoped package:

```bash
openclaw plugins install clawhub:@johnson9316-bit/taskfold
openclaw plugins enable taskfold
openclaw gateway restart
```

### From GitHub

Install directly from this repository:

```bash
openclaw plugins install git:github.com/johnson9316-bit/Taskfold
openclaw plugins enable taskfold
openclaw gateway restart
```

Open the **Taskfold** tab from the OpenClaw Control UI after the Gateway has
restarted.

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

Taskfold stores its SQLite state under:

```text
plugins/taskfold/taskfold.sqlite
```

relative to `OPENCLAW_STATE_DIR`. It uses its own data, commands, tools, RPC
methods, UI route, and database namespace. The bundled OpenClaw Workboard can
remain enabled.

### Migrating From Flowboard

Taskfold `0.2.0` is the renamed successor to the local Flowboard plugin. Before
the first Taskfold startup, disable the old `flowboard` plugin and restart the
Gateway. If `plugins/flowboard/flowboard.sqlite` exists and the Taskfold
database does not, Taskfold makes a consistent SQLite snapshot at
`plugins/taskfold/taskfold.sqlite` and upgrades its private table names. The
old database is left untouched as a rollback copy.

When a card starts OpenClaw-native execution, Taskfold only supports a
managed Git worktree. It does not fall back to running directly in the primary
checkout. Stopping an execution preserves the card's business status and does
not automatically infer delivery, validation, or release facts.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
npm run check:public-names
npm run pack:check
```

For local Gateway testing:

```bash
openclaw plugins install --link /path/to/Taskfold
openclaw plugins enable taskfold
openclaw gateway restart
openclaw plugins inspect taskfold --runtime
openclaw plugins doctor
```

After changing `browser/` sources, rebuild the Control UI bundle and reload it
in the running Gateway without a full restart:

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
