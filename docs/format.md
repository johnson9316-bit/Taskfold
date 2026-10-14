# On-disk format

This is the reference for the data format Taskfold keeps in a repository. It is
the single place where the on-disk format is specified; the README, the CLI
instructions and the design notes refer here.

The format is versioned by `format_version` in `.taskfold/config.yml` (see
[Format version](#format-version)). The current version is **4**.

## Where data lives

Data lives under `<repo>/.taskfold/` in the repository's **main checkout**.
Git worktrees read and write the main checkout's directory; a copy inside a
worktree is a stale snapshot.

```
.taskfold/
  cards/                    one Markdown file per card
  milestones/               one Markdown file per milestone (named after its title)
  documents/                document-library registry (*.json) and, when registered,
                            the document files themselves
  attachments/<card uuid>/  images pasted into or attached to a card
  archive/                  archived cards
  config.yml                format_version + project-defined statuses
  .runtime/                 per-card runtime state, changes.log   (not in Git)
  .locks/                   cross-process lock files             (not in Git)
```

`.runtime/` and `.locks/` are runtime state: card revisions, execution claims
and heartbeats, and lock files. They are intentionally not committed and are
rebuilt as needed; deleting them loses no card content.

## Card files

`cards/card-<N> - <title>.md` — for example `cards/card-42 - Fix the redirect.md`.
Renaming the title does not rename the file. A card file has three parts:

1. **Frontmatter** — a Backlog.md-compatible subset of keys, including `id`
   (`CARD-<N>`, the display ID), `title`, `status` (an id from the project's
   statuses, see `config.yml`), `assignee`, `created_date`, `updated_date`,
   `labels`, `milestone` (milestone UUID), `priority` and `ordinal`.
2. **Standard Markdown sections** — `## Description` and, when present,
   `## Acceptance Criteria`, `## Definition of Done`, `## Implementation Plan`,
   `## Notes` and other prose. Free-form content.
3. **The `TASKFOLD` sentinel block** — a JSON object between
   `<!-- SECTION:TASKFOLD:BEGIN -->` and `<!-- SECTION:TASKFOLD:END -->`. It is
   tool state: `uuid` (the card's identity, referenced by attachments and
   milestone associations), `position` (full-precision ordering; `ordinal` in
   frontmatter is the rounded projection), `createdAt`, the card body (`notes`),
   delivery records, execution data, `metadata` (blocked / dispatch markers,
   board placement) and the event history.

`status` values are project-defined; the engine reasons about the four fixed
categories and about card markers, never about status names — see
[config.yml](#configyml).

## Milestone files

`milestones/<title>.md` — named after the milestone title; renames follow title
changes, and duplicate filenames get a short UUID suffix. Frontmatter: `title`,
`state`, `created_date`, `updated_date`, `ordinal`. The `TASKFOLD` block carries
`uuid`, `boardId`, `position` and an optional `color`. Cards point at milestones
by UUID, so title changes never break associations.

## config.yml

```yaml
format_version: 4
statuses:
  - id: todo
    category: unstarted
    default: true
  - id: running
    category: started
  - id: done
    category: completed
  - id: cancelled
    category: cancelled
  # ... project-defined; entries may also carry role, color and a display name
```

- `format_version` — see [Format version](#format-version).
- `statuses` — the project's statuses. Every status has an `id` and one of four
  fixed `category` values (`unstarted`, `started`, `completed`, `cancelled`),
  plus optional `role` (for example the review or intake role), `default`,
  `color` and a display `name`. Blocked, queued-for-dispatch and scheduled are
  **marks on a card, not statuses**.

## Document library

`documents/*.json` are registry entries recording metadata only — `id`,
`boardId`, `key`, `section`, `type`, `title`, `position`, `summary` and a
`target` path. Taskfold stores paths, not contents: the reader opens the
registered file on demand and read-only. Registry entries are managed through
the CLI or a host (board UI, VS Code); the registered document files themselves
are ordinary Markdown that you own.

## Format version

`format_version` is a monotonic guard, not a promise of migration tooling:

- A client older than the data treats the project as **read-only**: it refuses
  writes with `FORMAT_TOO_NEW`.
- Upgrades are **lazy**: a project moves to the next version when the first
  feature that needs it is first written, not on read.
- All writers (OpenClaw plugin, CLI, VS Code extension) should run the same
  version; when they don't, the newer side's data stays safe and the older side
  simply cannot write.

| Version | Introduced |
| --- | --- |
| 1 | initial file format (cards, milestones, documents) |
| 2 | milestones as title-named files with UUID associations |
| 3 | card images under `attachments/<card uuid>/` |
| 4 | project-defined statuses (four fixed categories + card marks) |

## Editing files by hand

The data is plain Markdown, and hand edits are supported: Taskfold detects
external edits and treats them as changes. The next read/write reconciles the
edit and bumps the card's revision — so a writer holding an older revision gets
a `CONFLICT` instead of silently overwriting your edit.

Rules:

- **Free to edit** — document bodies; the standard Markdown sections of card and
  milestone files (`## Description` and the other prose sections).
- **Careful** — frontmatter values. Keep them valid; `status` must be one of the
  project's statuses (an unknown value is flagged by the UI, not silently
  applied). A hand edit bumps the revision, by design.
- **Tool state, don't edit** — the `TASKFOLD` sentinel blocks, the
  `documents/*.json` registry entries, `.runtime/` and `.locks/`. Change these
  through the CLI or a host.
- Don't edit a file while a board or an agent is actively writing it: the
  revision check protects against stale writers, not against a same-second race
  between your editor and a writer.

AI agents working in a repository should always use the `taskfold` CLI (or the
host tools): the CLI takes cross-process locks and per-card revision checks that
a direct file write bypasses.

This repository's own `.taskfold/` is a live example of the format.
