// 给 AI 的指引（需求/18 §4）：注入 AGENTS.md / CLAUDE.md 的短标记块，与 `taskfold instructions`
// 打印的详细用法。两者的版本号都取 CLI 版本（version.ts），CLI 升级后重跑 `taskfold guidelines`
// 就地换成新版本的块。
import fs from "node:fs";
import path from "node:path";
import { TASKFOLD_PRIORITIES, TASKFOLD_STATUSES } from "@taskfold/core/contract/index.js";
import { TASKFOLD_CLI_EXIT_CODES } from "./errors.js";
import { TaskfoldCliError } from "./errors.js";
import { TASKFOLD_CLI_SCHEMA_VERSION, TASKFOLD_CLI_VERSION } from "./version.js";

const START_PREFIX = "<!-- TASKFOLD GUIDELINES START";
const END_MARKER = "<!-- TASKFOLD GUIDELINES END -->";
/** 一整块：START（版本号可有可无，兼容手写的块）到最近的 END。 */
const BLOCK_PATTERN = /<!-- TASKFOLD GUIDELINES START(?: v[^\s>]*)? -->[\s\S]*?<!-- TASKFOLD GUIDELINES END -->/g;

/** 默认注入的文件（相对仓库根）：AGENTS.md 给 Codex 等，CLAUDE.md 给 Claude Code。 */
export const DEFAULT_GUIDELINE_FILES = ["AGENTS.md", "CLAUDE.md"] as const;

export function renderGuidelinesBlock(version: string = TASKFOLD_CLI_VERSION): string {
  return [
    `${START_PREFIX} v${version} -->`,
    "## Taskfold task cards",
    "",
    "This repository tracks its tasks with Taskfold; the cards live under `.taskfold/`.",
    "",
    "- **Never create, edit, move or delete files under `.taskfold/` directly** (including the",
    "  `.md` card files). Always read and write cards through the `taskfold` CLI.",
    "- Run `taskfold instructions` for the full usage before you first work with cards, or",
    "  whenever you are unsure how a command behaves.",
    '- Quick reference: `taskfold list`, `taskfold show <id>`, `taskfold create "<title>"`,',
    "  `taskfold update <id> --status done`. Add `--json` for machine-readable output.",
    "- Name projects/boards by purpose and milestones/phases by concrete goals or deliverables.",
    "  Avoid numbered names or prefixes (M1, M2, Phase 1, 阶段一); preserve user-specified names.",
    END_MARKER,
  ].join("\n");
}

export type GuidelinesAction = "created" | "inserted" | "updated" | "unchanged";

/**
 * 把标记块写进一份文本：没有块 → 追加到末尾；已有块 → 就地替换成当前版本（多份只留第一份的
 * 位置）；内容已一致 → unchanged。START/END 不成对时不猜，拒绝改动（REJECTED）。
 */
export function upsertGuidelinesBlock(existing: string | undefined): { content: string; action: GuidelinesAction } {
  const block = renderGuidelinesBlock();
  if (existing === undefined) {
    return { content: `${block}\n`, action: "created" };
  }
  const matches = [...existing.matchAll(BLOCK_PATTERN)];
  const starts = existing.split(START_PREFIX).length - 1;
  const ends = existing.split(END_MARKER).length - 1;
  if (starts !== matches.length || ends !== matches.length) {
    throw new TaskfoldCliError(
      "REJECTED",
      "found an unbalanced TASKFOLD GUIDELINES START/END marker; fix the file by hand, then rerun.",
    );
  }
  if (matches.length === 0) {
    const separator = existing.length === 0 ? "" : existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
    return { content: `${existing}${separator}${block}\n`, action: "inserted" };
  }
  let content = "";
  let cursor = 0;
  matches.forEach((match, index) => {
    content += existing.slice(cursor, match.index) + (index === 0 ? block : "");
    cursor = match.index + match[0].length;
  });
  content += existing.slice(cursor);
  return { content, action: content === existing ? "unchanged" : "updated" };
}

export type GuidelinesFileResult = { path: string; action: GuidelinesAction };

/** 逐个文件注入。CLAUDE.md 常是指向 AGENTS.md 的符号链接：按真实路径去重，且写入跟随链接、不替换它。 */
export function writeGuidelines(files: readonly string[]): GuidelinesFileResult[] {
  const results: GuidelinesFileResult[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const absolute = path.resolve(file);
    let identity = absolute;
    try {
      identity = fs.realpathSync(absolute);
    } catch {
      // 还不存在：按给出的路径算。
    }
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    let existing: string | undefined;
    try {
      existing = fs.readFileSync(absolute, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    const { content, action } = upsertGuidelinesBlock(existing);
    if (action !== "unchanged") {
      fs.writeFileSync(absolute, content);
    }
    results.push({ path: absolute, action });
  }
  return results;
}

function errorCodeRows(): string {
  const meaning: Record<keyof typeof TASKFOLD_CLI_EXIT_CODES, string> = {
    INVALID_ARGUMENT: "Bad flag or value. Fix the command.",
    REVISION_REQUIRED: "Replacing the body needs --expect-revision. Run `show --json`, then pass its revision.",
    NOT_INITIALIZED: "No .taskfold/ in this repository. Run `taskfold init` (once per repository).",
    NOT_FOUND: "No card with that id or prefix. Run `taskfold list`.",
    AMBIGUOUS: "The id prefix matches several cards (use a longer one), or several boards exist (pass --board).",
    CONFLICT: "The card changed since the revision you used. Run `show --json`, redo your change on the new text, retry.",
    LOCKED: "Another process holds the lock. Wait a second and rerun the same command.",
    FORMAT_TOO_NEW: "The data was written by a newer Taskfold. Upgrade the CLI; do not edit files by hand.",
    REJECTED: "Taskfold refused the change (limits, status rules). Read `message`.",
    INTERNAL: "Unexpected failure. Read `message`.",
  };
  return (Object.keys(TASKFOLD_CLI_EXIT_CODES) as Array<keyof typeof TASKFOLD_CLI_EXIT_CODES>)
    .map((code) => `| ${code} | ${TASKFOLD_CLI_EXIT_CODES[code]} | ${meaning[code]} |`)
    .join("\n");
}

/** `taskfold instructions` 的全文（Markdown）。 */
export function renderInstructions(): string {
  return `# Taskfold CLI instructions (v${TASKFOLD_CLI_VERSION})

Taskfold keeps task cards as Markdown files under \`.taskfold/\` at the root of the
repository's main checkout. **Read and write cards only through the \`taskfold\` CLI.**
Never create, edit, move or delete files under \`.taskfold/\` by hand: the CLI takes
cross-process locks and checks revisions, and hand edits bypass both.

## Basics

- Run commands from anywhere inside the repository. Inside a git worktree they still read
  and write the main checkout's \`.taskfold/\`.
- Add \`--json\` whenever you need to parse the output. Every success prints one JSON object
  on stdout: \`{"schemaVersion": ${TASKFOLD_CLI_SCHEMA_VERSION}, "kind": "<kind>", ...}\`.
- Every failure exits non-zero and prints one JSON object on stderr:
  \`{"schemaVersion": ${TASKFOLD_CLI_SCHEMA_VERSION}, "kind": "error", "error": {"code": "<CODE>", "message": "...", "details": {...}}}\`.
  Branch on \`error.code\`, not on the message.
- Card ids are UUIDs. A unique prefix or the \`card-N\` \`displayId\` from \`list\` also works.
- Each card has a \`revision\` number that increases on every write.

## Naming

When proposing project or board names, describe the project or business purpose
(e.g. 'Customer Support Platform'). Name milestones or phases after concrete goals
or deliverables (e.g. 'File Storage Migration' or 'Authentication and Permissions').
Do not default to numbered names or add prefixes such as M1, M2, M3, Phase 1, or 阶段一,
even when existing names use that style. Preserve names explicitly specified by the
user and do not rename existing items unless asked.

## Commands

| Command | Reads / writes |
| --- | --- |
| \`taskfold init\` | creates \`.taskfold/\` (once per repository) |
| \`taskfold list [--status s1,s2] [--label l] [--board id] [--include-archived]\` | reads cards |
| \`taskfold show <id>\` | reads one card, including its notes |
| \`taskfold create <title...> [--notes t \\| --notes-file f] [--status s] [--priority p] [--labels a,b] [--agent id] [--board id]\` | creates a card |
| \`taskfold update <id> [--title t] [--status s] [--priority p] [--add-label l] [--remove-label l] [--agent id] [--append-notes t \\| --append-notes-file f]\` | changes only the fields you pass |
| \`taskfold update <id> --notes t --expect-revision N\` (or \`--notes-file f\`) | replaces the whole notes body |
| \`taskfold delete <id>\` | deletes a card permanently |
| \`taskfold boards\` | reads boards and card counts |
| \`taskfold instructions\` | prints this text |
| \`taskfold guidelines [file...]\` | writes the short Taskfold block into AGENTS.md / CLAUDE.md |

Run \`taskfold <command> --help\` for every flag and more examples.

- Statuses: ${TASKFOLD_STATUSES.join(", ")}. New cards start as \`todo\`.
- Priorities: ${TASKFOLD_PRIORITIES.join(", ")}.
- \`--notes-file -\` / \`--append-notes-file -\` read the text from stdin.

## Editing rules

1. **Field flags are incremental.** \`update\` changes only the fields you pass and applies
   them to the latest version of the card. No revision is needed; concurrent edits to other
   fields are kept. Change status with \`--status\`.
2. **\`notes\` is the card body.** Prefer \`--append-notes\` to add progress, findings or
   results: it adds a new paragraph at the end.
3. **Replacing the whole body needs the revision you read.** \`--notes\` / \`--notes-file\`
   require \`--expect-revision N\`, where N is \`card.revision\` from your latest
   \`taskfold show <id> --json\`. Without it the command fails with REVISION_REQUIRED. If the
   card changed in the meantime it fails with CONFLICT: show it again, redo your edit on the
   new body, and retry with the new revision.
4. On LOCKED, wait about a second and rerun the same command. Nothing was written.

## JSON output kinds

| kind | printed by | payload |
| --- | --- | --- |
| \`card\` | show, create, update | \`card\`: id, shortId, displayId, title, status, priority, labels, agentId, boardId, milestoneId, archived, revision, createdAt, updatedAt, notes |
| \`card-list\` | list | \`boardId\` (null = all boards), \`cards\`: the same fields as \`card\` without notes |
| \`card-deleted\` | delete | \`id\` |
| \`board-list\` | boards | \`defaultBoardId\` (null if ambiguous), \`boards\`: id, total, active, archived, byStatus |
| \`init\` | init | \`dataDir\`, \`created\`, \`formatVersion\` |
| \`guidelines\` | guidelines | \`version\`, \`files\`: path, action (created / inserted / updated / unchanged) |
| \`instructions\` | instructions | \`version\`, \`text\` |
| \`error\` | any failure, on stderr | \`error\`: code, message, details |

## Error codes

| code | exit | meaning / what to do |
| --- | --- | --- |
${errorCodeRows()}

## Example session

\`\`\`sh
taskfold list --json
taskfold create "Write the release notes" --labels docs --json      # note card.id
taskfold update 1a2b3c4d --status running --json
taskfold update 1a2b3c4d --append-notes "Drafted the summary section." --json
taskfold show 1a2b3c4d --json                                         # note card.revision, e.g. 4
taskfold update 1a2b3c4d --notes-file notes.md --expect-revision 4 --json
taskfold update 1a2b3c4d --status done --json
\`\`\`
`;
}
