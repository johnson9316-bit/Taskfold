# @taskfold/cli

`taskfold` is a standalone command-line interface for the Taskfold cards stored in a
repository's `.taskfold/` directory. It embeds `@taskfold/core` in-process: no OpenClaw,
no Gateway, and nothing under `~/.openclaw` is needed or touched. It covers card
create/read/update/delete and status changes; it does not run or dispatch work.

It is the write path for AI agents (Claude Code, Codex, ...): agents call the CLI through
the shell, and the CLI takes the same cross-process locks and revision checks as every
other Taskfold host.

The OpenClaw plugin and VS Code extension use the same `.taskfold/` files.

## Build and run

```bash
npm install                    # from the repository root
npm run build:cli              # or: npm run build -w @taskfold/cli
node packages/cli/dist/taskfold.js --help
```

The build writes one self-contained ESM file, `packages/cli/dist/taskfold.js` (core,
commander and proper-lockfile are bundled in), with a `#!/usr/bin/env node` shebang. It
can be copied anywhere and run with Node.js 22 or newer; the workspace itself is developed
on Node.js `>=24.16.0`. To call it as `taskfold`, put a small wrapper on your `PATH`:

```sh
#!/bin/sh
exec node /path/to/Taskfold/packages/cli/dist/taskfold.js "$@"
```

## Getting started in a repository

```bash
taskfold init          # creates .taskfold/ at the root of the main checkout
taskfold guidelines    # adds the short Taskfold block to AGENTS.md and CLAUDE.md
taskfold create "My first card"
taskfold list
```

`init` writes only inside `.taskfold/`: `config.yml` (with `format_version`), a
`.gitignore` for `.locks/` and `.runtime/`, and the data directories. Commit `config.yml`
and `.gitignore`; the rest is created on demand.

## Commands

| Command | Reads / writes |
| --- | --- |
| `taskfold init` | writes `.taskfold/` (safe to rerun) |
| `taskfold list [--status s1,s2] [--label l] [--board id] [--include-archived]` | reads cards |
| `taskfold show <id>` | reads one card, including its notes |
| `taskfold create <title...> [--notes t \| --notes-file f] [--status s] [--priority p] [--labels a,b] [--agent id] [--board id]` | writes a new card |
| `taskfold update <id> [--title t] [--status s] [--priority p] [--add-label l] [--remove-label l] [--agent id] [--append-notes t \| --append-notes-file f]` | writes the fields you pass |
| `taskfold update <id> --notes t --expect-revision N` (or `--notes-file f`) | replaces the whole body |
| `taskfold delete <id>` | deletes a card |
| `taskfold boards` | reads boards and counts |
| `taskfold instructions` | prints the detailed guide for AI agents |
| `taskfold guidelines [file...]` | writes the Taskfold block into AGENTS.md / CLAUDE.md |

Every command's `--help` lists its flags, what it reads and writes, and examples.

- **Ids**: `show`, `update`, and `delete` accept a UUID, unique UUID prefix, or the
  `card-N` display number shown by `list` and `--json` (`displayId`).
- **Project discovery**: the CLI looks for `.taskfold/` from the current directory up to
  the repository root. Inside a git worktree it maps the current directory to the main
  checkout first (`git rev-parse --git-common-dir`), so reads and writes always hit the
  main checkout's `.taskfold/`; the worktree's copy is never read or written.
- **Boards**: every card belongs to a board. `list` shows all boards unless `--board` is
  given. `create` without `--board` uses the only board that already has cards, or
  `default` in an empty repository; if cards sit on several boards it fails with
  `AMBIGUOUS` and asks for `--board`.

## Editing rules

- Field flags are **incremental**: `update` changes only the fields you pass, applied to the
  latest version of the card. Internally it is a compare-and-swap on the revision it just
  read, re-read and retried on a concurrent write, so edits other processes made to other
  fields are kept. No revision is needed.
- `notes` is the card body. `--append-notes` adds a paragraph at the end.
- Replacing the whole body (`--notes` / `--notes-file`) requires `--expect-revision N`,
  the `revision` from your latest `show --json`. Without it: `REVISION_REQUIRED`. If the
  card changed since: `CONFLICT`, and nothing is written.

## Output contract

- **Text** by default. Colors only when stdout is a terminal (and `NO_COLOR` is unset);
  piped or redirected output is plain text without any control characters.
- **`--json`**: one JSON object on stdout, `{"schemaVersion": 1, "kind": "<kind>", ...}`.
  `schemaVersion` versions this output contract only. It is unrelated to `format_version`
  in `.taskfold/config.yml`, which versions the on-disk data and belongs to core.

| kind | command | payload |
| --- | --- | --- |
| `card` | show, create, update | `card`: id, shortId, displayId, title, status, priority, labels, agentId, boardId, milestoneId, archived, revision, createdAt, updatedAt, notes |
| `card-list` | list | `boardId` (null = all), `cards` (same fields, without notes) |
| `card-deleted` | delete | `id` |
| `board-list` | boards | `defaultBoardId` (null if ambiguous), `boards`: id, total, active, archived, byStatus |
| `init` | init | `dataDir`, `created`, `formatVersion` |
| `guidelines` | guidelines | `version`, `files`: path, action |
| `instructions` | instructions | `version`, `text` |

Absent values are `null`, `[]`, `""` or `false`; keys are never omitted.

- **Errors** always print one line of JSON on stderr, with or without `--json`:
  `{"schemaVersion": 1, "kind": "error", "error": {"code": "...", "message": "...", "details": {...}}}`
  (`details` only when there is something to add), and exit with a non-zero code:

| code | exit | meaning |
| --- | --- | --- |
| `INTERNAL` | 1 | unexpected failure, including I/O errors |
| `INVALID_ARGUMENT` | 2 | unknown flag, bad value, conflicting flags, nothing to update |
| `REVISION_REQUIRED` | 2 | body replacement without `--expect-revision` |
| `NOT_INITIALIZED` | 3 | no `.taskfold/` found; run `taskfold init` |
| `NOT_FOUND` | 4 | no card with that id or prefix |
| `AMBIGUOUS` | 4 | the prefix matches several cards, or several boards are in use |
| `CONFLICT` | 5 | the card changed since the revision you used |
| `LOCKED` | 6 | another process held the lock for about 2 seconds; nothing was written, retry |
| `FORMAT_TOO_NEW` | 7 | `.taskfold/` was written by a newer Taskfold; this CLI is read-only there |
| `REJECTED` | 8 | core refused the change (field limits, status rules); see `message` |

`LOCKED` and `CONFLICT` are told apart by the failure reason core reports for the
compare-and-swap, not guessed from the outcome.

There is no `--compact` flag: the JSON card view already leaves out the heavy internal
fields (events, execution, claims, metadata), and `list` omits the notes. A second,
smaller shape would save little and double the contract to keep stable.

## Guidance for AI agents

`taskfold guidelines [file...]` inserts a short block into `AGENTS.md` and `CLAUDE.md` at
the repository root (or the files you name), between
`<!-- TASKFOLD GUIDELINES START v<version> -->` and `<!-- TASKFOLD GUIDELINES END -->`.
The block tells agents never to edit files under `.taskfold/` directly and to run
`taskfold instructions` for the full usage. Rerunning replaces the block in place (a
symlinked `CLAUDE.md` is followed, not replaced); nothing else in the file changes. The
block version, the `instructions` header and `taskfold --version` are all the CLI version.

## Not supported

WSL drvfs paths (`/mnt/c/...`) and `\\wsl$` paths are not supported: `proper-lockfile`
misreports locks there as compromised. Keep the repository on a native Linux, macOS or
Windows filesystem and run the CLI on the same side as the files.
