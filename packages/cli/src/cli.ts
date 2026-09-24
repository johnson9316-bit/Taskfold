// `taskfold` CLI 的命令定义（需求/18 §4）。只暴露卡片的增删改查与状态流转，不暴露执行
// （claim / dispatch / launch 等）。`runCli` 不碰 process 全局（cwd、流、环境都由调用方给），
// 便于进程内测试；bin.ts 负责接上真实进程。
import fs from "node:fs";
import path from "node:path";
import { Command, CommanderError, InvalidArgumentError } from "commander";
import {
  isValidTaskfoldBoardId,
  TASKFOLD_PRIORITIES,
  TASKFOLD_STATUSES,
  type TaskfoldCard,
} from "@taskfold/core/contract/index.js";
import type { TaskfoldProjectStore } from "@taskfold/core/store-projects.js";
import {
  boardsInUse,
  defaultBoardFor,
  resolveCard,
  resolveCreateBoard,
  toCardDetail,
  toCardSummary,
  updateCardWithRetry,
} from "./cards.js";
import { TASKFOLD_CLI_EXIT_CODES, TaskfoldCliError, toCliError } from "./errors.js";
import {
  DEFAULT_GUIDELINE_FILES,
  renderInstructions,
  writeGuidelines,
} from "./guidelines.js";
import { CliOutput, type CliWritable } from "./output.js";
import { gitTopLevel, initTaskfoldProject, openTaskfoldProject } from "./project.js";
import { TASKFOLD_CLI_VERSION } from "./version.js";

export type RunCliOptions = {
  /** 不含 `node` 与脚本路径的参数，如 `["list", "--json"]`。 */
  argv: readonly string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdout: CliWritable;
  stderr: CliWritable;
  /** `--notes-file -` 等读 stdin 时用。 */
  stdin?: AsyncIterable<string | Buffer>;
};

const UNSUPPORTED_PATHS_NOTE =
  "Not supported: WSL drvfs paths (/mnt/c/...) and \\\\wsl$ paths -- file locks there are\n" +
  "misreported as compromised. Keep the repository on a native Linux/macOS/Windows filesystem.";

// ---------------------------------------------------------------------------
// 参数解析（失败抛 InvalidArgumentError，commander 转成 INVALID_ARGUMENT）
// ---------------------------------------------------------------------------

function parseStatus(value: string): string {
  if (!(TASKFOLD_STATUSES as readonly string[]).includes(value)) {
    throw new InvalidArgumentError(`status must be one of: ${TASKFOLD_STATUSES.join(", ")}.`);
  }
  return value;
}

function parseStatusList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map(parseStatus);
}

function parsePriority(value: string): string {
  if (!(TASKFOLD_PRIORITIES as readonly string[]).includes(value)) {
    throw new InvalidArgumentError(`priority must be one of: ${TASKFOLD_PRIORITIES.join(", ")}.`);
  }
  return value;
}

function parseBoardId(value: string): string {
  const boardId = value.trim().toLowerCase();
  if (!isValidTaskfoldBoardId(boardId)) {
    throw new InvalidArgumentError("board id must match [a-z0-9][a-z0-9._-]{0,79}.");
  }
  return boardId;
}

function parseRevision(value: string): number {
  if (!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(Number(value))) {
    throw new InvalidArgumentError("revision must be a non-negative integer.");
  }
  return Number(value);
}

function collect(value: string, previous: string[] | undefined): string[] {
  return [...(previous ?? []), value];
}

function splitList(value: string | undefined): string[] | undefined {
  return value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function exclusive(options: Record<string, unknown>, a: string, b: string, flagA: string, flagB: string): void {
  if (options[a] !== undefined && options[b] !== undefined) {
    throw new TaskfoldCliError("INVALID_ARGUMENT", `${flagA} and ${flagB} cannot be used together.`);
  }
}

async function readAll(stream: AsyncIterable<string | Buffer> | undefined): Promise<string> {
  if (!stream) {
    return "";
  }
  let text = "";
  for await (const chunk of stream) {
    text += typeof chunk === "string" ? chunk : chunk.toString("utf8");
  }
  return text;
}

async function readTextSource(source: string, run: RunCliOptions, flag: string): Promise<string> {
  if (source === "-") {
    return await readAll(run.stdin);
  }
  try {
    return fs.readFileSync(path.resolve(run.cwd, source), "utf8");
  } catch (error) {
    throw new TaskfoldCliError("INVALID_ARGUMENT", `${flag}: cannot read ${source}: ${(error as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// 人读文本
// ---------------------------------------------------------------------------

function cardLine(out: CliOutput, card: TaskfoldCard): string {
  const view = toCardSummary(card);
  const labels = view.labels.length ? `  [${view.labels.join(", ")}]` : "";
  const archived = view.archived ? "  (archived)" : "";
  return `${out.dim(view.shortId)}  ${out.status(view.status, 9)} ${view.priority.padEnd(6)}  ${view.boardId}  ${view.title}${labels}${archived}`;
}

function printCardDetail(out: CliOutput, card: TaskfoldCard): void {
  const view = toCardDetail(card);
  out.line(out.bold(view.title));
  const rows: Array<[string, string]> = [
    ["id", view.id],
    ["status", out.status(view.status)],
    ["priority", view.priority],
    ["labels", view.labels.length ? view.labels.join(", ") : "-"],
    ["agent", view.agentId ?? "-"],
    ["board", view.boardId],
    ["revision", String(view.revision)],
    ["created", view.createdAt],
    ["updated", view.updatedAt],
  ];
  if (view.archived) {
    rows.push(["archived", "yes"]);
  }
  for (const [key, value] of rows) {
    out.line(`  ${out.dim(key.padEnd(9))} ${value}`);
  }
  out.line();
  out.line(view.notes || out.dim("(no notes)"));
}

// ---------------------------------------------------------------------------
// 命令
// ---------------------------------------------------------------------------

type JsonFlag = { json?: boolean };

function helpText(sections: { reads?: string; writes?: string; examples: string[] }): string {
  const lines = ["", "Reads/writes:"];
  lines.push(`  Reads:  ${sections.reads ?? "nothing"}`);
  lines.push(`  Writes: ${sections.writes ?? "nothing"}`);
  lines.push("", "Examples:");
  for (const example of sections.examples) {
    lines.push(`  $ ${example}`);
  }
  return lines.join("\n");
}

/** 打开 `cwd` 所属仓库的 `.taskfold/`，跑一个命令。 */
async function withProject<T>(run: RunCliOptions, body: (store: TaskfoldProjectStore) => Promise<T>): Promise<T> {
  const { store } = openTaskfoldProject(run.cwd);
  return await body(store);
}

function buildProgram(run: RunCliOptions, out: CliOutput): Command {
  const program = new Command("taskfold");
  program
    .description(
      "Read and write the Taskfold task cards stored in this repository's .taskfold/ directory.\n\n" +
        "Output is human-readable text by default (plain, without colors, when stdout is not a " +
        "terminal) and a single JSON object with --json. Failures exit non-zero and print a JSON " +
        "error object on stderr. AI agents: run `taskfold instructions` for the full guide.",
    )
    .version(TASKFOLD_CLI_VERSION, "-V, --version", "print the CLI version")
    .helpOption("-h, --help", "show help for a command")
    .exitOverride()
    .configureOutput({
      writeOut: (text) => run.stdout.write(text),
      writeErr: (text) => run.stderr.write(text),
      // commander 自己的错误提示不打印：统一由 runCli 以 JSON 写到 stderr。
      outputError: () => {},
    })
    .addHelpText(
      "after",
      [
        "",
        "Exit codes (the stderr JSON carries error.code):",
        ...(Object.keys(TASKFOLD_CLI_EXIT_CODES) as Array<keyof typeof TASKFOLD_CLI_EXIT_CODES>).map(
          (code) => `  ${String(TASKFOLD_CLI_EXIT_CODES[code]).padEnd(2)} ${code}`,
        ),
        "",
        "Getting started:",
        "  $ taskfold init          # once per repository",
        "  $ taskfold guidelines    # add the AI usage block to AGENTS.md and CLAUDE.md",
        '  $ taskfold create "My first card"',
        "",
        UNSUPPORTED_PATHS_NOTE,
      ].join("\n"),
    );

  program
    .command("init")
    .description("create .taskfold/ at the root of this git repository's main checkout (safe to rerun)")
    .option("--json", "print one JSON object (kind: init)")
    .addHelpText(
      "after",
      helpText({
        reads: "<repo>/.taskfold/config.yml if it already exists",
        writes:
          "<repo>/.taskfold/ -- config.yml (format_version), .gitignore, cards/ and the other data\n" +
          "          directories, .runtime/changes.log. Nothing outside .taskfold/. Inside a git worktree\n" +
          "          it initializes the main checkout. Outside git it uses the current directory.",
        examples: ["taskfold init", "taskfold init --json"],
      }),
    )
    .action((options: JsonFlag) => {
      const result = initTaskfoldProject(run.cwd);
      if (options.json) {
        out.json("init", result);
        return;
      }
      out.line(`${result.created ? "Initialized" : "Already initialized:"} Taskfold in ${result.dataDir}`);
      out.line("Next: run `taskfold guidelines` to add the AI usage block to AGENTS.md and CLAUDE.md.");
    });

  program
    .command("list")
    .description("list cards (archived cards are hidden unless --include-archived)")
    .option("--status <statuses>", `only these statuses, comma-separated (${TASKFOLD_STATUSES.join(", ")})`, parseStatusList)
    .option("--label <label>", "only cards carrying this label")
    .option("--board <id>", "only cards on this board (default: all boards)", parseBoardId)
    .option("--include-archived", "include archived cards")
    .option("--json", "print one JSON object (kind: card-list)")
    .addHelpText(
      "after",
      helpText({
        reads: "all cards under .taskfold/cards/",
        examples: ["taskfold list", "taskfold list --status todo,running --json", "taskfold list --label docs --board default"],
      }),
    )
    .action(
      async (options: JsonFlag & { status?: string[]; label?: string; board?: string; includeArchived?: boolean }) => {
        await withProject(
          run,
          async (store) => {
            const cards = (await store.list(options.board ? { boardId: options.board } : {})).filter(
              (card) =>
                (options.includeArchived || !card.metadata?.archivedAt) &&
                (!options.status?.length || options.status.includes(card.status)) &&
                (!options.label || card.labels.includes(options.label)),
            );
            if (options.json) {
              out.json("card-list", { boardId: options.board ?? null, cards: cards.map(toCardSummary) });
              return;
            }
            if (cards.length === 0) {
              out.line("No cards.");
            }
            for (const card of cards) {
              out.line(cardLine(out, card));
            }
          }
        );
      },
    );

  program
    .command("show")
    .argument("<id>", "card id or a unique prefix of it (e.g. the 8-character short id)")
    .description("show one card, including its notes (the card body) and current revision")
    .option("--json", "print one JSON object (kind: card)")
    .addHelpText(
      "after",
      helpText({
        reads: "the card's file under .taskfold/cards/",
        examples: ["taskfold show 1a2b3c4d", "taskfold show 1a2b3c4d --json"],
      }),
    )
    .action(async (id: string, options: JsonFlag) => {
      await withProject(
        run,
        async (store) => {
          const card = await resolveCard(store, id);
          if (options.json) {
            out.json("card", { card: toCardDetail(card) });
            return;
          }
          printCardDetail(out, card);
        }
      );
    });

  program
    .command("create")
    .argument("<title...>", "card title (several words are joined with spaces)")
    .description("create a card")
    .option("--notes <text>", "card body")
    .option("--notes-file <path>", "read the card body from a file (- for stdin)")
    .option("--status <status>", `initial status (${TASKFOLD_STATUSES.join(", ")})`, parseStatus, "todo")
    .option("--priority <priority>", `priority (${TASKFOLD_PRIORITIES.join(", ")})`, parsePriority, "normal")
    .option("--labels <items>", "comma-separated labels")
    .option("--agent <id>", "assigned agent id")
    .option(
      "--board <id>",
      "board to put the card on (default: the only board already in use, or 'default' in an empty repository)",
      parseBoardId,
    )
    .option("--json", "print one JSON object (kind: card)")
    .addHelpText(
      "after",
      helpText({
        reads: "existing cards (to pick the default board)",
        writes: "a new card file under .taskfold/cards/ and its state under .taskfold/.runtime/",
        examples: [
          'taskfold create "Fix the login redirect"',
          'taskfold create "Write release notes" --labels docs,release --priority high --json',
          'taskfold create "Investigate flaky test" --notes-file notes.md --status backlog',
        ],
      }),
    )
    .action(
      async (
        titleWords: string[],
        options: JsonFlag & {
          notes?: string;
          notesFile?: string;
          status: string;
          priority: string;
          labels?: string;
          agent?: string;
          board?: string;
        },
      ) => {
        exclusive(options, "notes", "notesFile", "--notes", "--notes-file");
        const notes =
          options.notesFile !== undefined ? await readTextSource(options.notesFile, run, "--notes-file") : options.notes;
        await withProject(
          run,
          async (store) => {
            const boardId = await resolveCreateBoard(store, options.board);
            const created = await store.create({
              title: titleWords.join(" "),
              notes,
              status: options.status,
              priority: options.priority,
              labels: splitList(options.labels),
              agentId: options.agent,
              boardId,
            });
            // 按落盘后的样子输出：md 里 created_date 只到分钟，不重读的话这里的 createdAt 与之后
            // `show` 看到的不一致。
            const card = (await store.get(created.id)) ?? created;
            if (options.json) {
              out.json("card", { card: toCardDetail(card) });
              return;
            }
            printCardDetail(out, card);
          }
        );
      },
    );

  program
    .command("update")
    .argument("<id>", "card id or a unique prefix of it")
    .description(
      "change a card. Field flags are incremental and need no revision; replacing the whole " +
        "body (--notes / --notes-file) requires --expect-revision",
    )
    .option("--title <title>", "new title")
    .option("--status <status>", `move to this status (${TASKFOLD_STATUSES.join(", ")})`, parseStatus)
    .option("--priority <priority>", `new priority (${TASKFOLD_PRIORITIES.join(", ")})`, parsePriority)
    .option("--add-label <label>", "add a label (repeatable)", collect)
    .option("--remove-label <label>", "remove a label (repeatable)", collect)
    .option("--agent <id>", 'assign an agent ("" clears it)')
    .option("--append-notes <text>", "append a paragraph to the card body")
    .option("--append-notes-file <path>", "append a paragraph read from a file (- for stdin)")
    .option("--notes <text>", "replace the whole card body (needs --expect-revision)")
    .option("--notes-file <path>", "replace the whole card body from a file, - for stdin (needs --expect-revision)")
    .option(
      "--expect-revision <n>",
      "only write if the card is still at this revision (from `show --json`); otherwise CONFLICT",
      parseRevision,
    )
    .option("--json", "print one JSON object (kind: card)")
    .addHelpText(
      "after",
      helpText({
        reads: "the card's file under .taskfold/cards/",
        writes:
          "that card's file and its state under .taskfold/.runtime/. Field flags are applied to the\n" +
          "          latest version of the card (re-read and retried on a concurrent write), so other\n" +
          "          fields changed meanwhile are kept.",
        examples: [
          "taskfold update 1a2b3c4d --status running",
          'taskfold update 1a2b3c4d --append-notes "Root cause: stale cache key." --add-label bug',
          "taskfold update 1a2b3c4d --status done --json",
          "taskfold update 1a2b3c4d --notes-file body.md --expect-revision 7 --json",
        ],
      }),
    )
    .action(
      async (
        id: string,
        options: JsonFlag & {
          title?: string;
          status?: string;
          priority?: string;
          addLabel?: string[];
          removeLabel?: string[];
          agent?: string;
          appendNotes?: string;
          appendNotesFile?: string;
          notes?: string;
          notesFile?: string;
          expectRevision?: number;
        },
      ) => {
        exclusive(options, "notes", "notesFile", "--notes", "--notes-file");
        exclusive(options, "appendNotes", "appendNotesFile", "--append-notes", "--append-notes-file");
        const addLabels = options.addLabel ?? [];
        const removeLabels = options.removeLabel ?? [];
        const replacesBody = options.notes !== undefined || options.notesFile !== undefined;
        const appendsBody = options.appendNotes !== undefined || options.appendNotesFile !== undefined;
        if (replacesBody && appendsBody) {
          throw new TaskfoldCliError("INVALID_ARGUMENT", "replace the body or append to it, not both.");
        }
        if (replacesBody && options.expectRevision === undefined) {
          throw new TaskfoldCliError(
            "REVISION_REQUIRED",
            "replacing the whole body needs --expect-revision <n>; read it with `taskfold show <id> --json`.",
          );
        }
        const notes =
          options.notesFile !== undefined ? await readTextSource(options.notesFile, run, "--notes-file") : options.notes;
        const appendNotes =
          options.appendNotesFile !== undefined
            ? await readTextSource(options.appendNotesFile, run, "--append-notes-file")
            : options.appendNotes;
        const hasChange =
          options.title !== undefined ||
          options.status !== undefined ||
          options.priority !== undefined ||
          options.agent !== undefined ||
          addLabels.length > 0 ||
          removeLabels.length > 0 ||
          notes !== undefined ||
          appendNotes !== undefined;
        if (!hasChange) {
          throw new TaskfoldCliError(
            "INVALID_ARGUMENT",
            "nothing to update; pass at least one of --title, --status, --priority, --add-label, " +
              "--remove-label, --agent, --append-notes, --notes.",
          );
        }
        await withProject(
          run,
          async (store) => {
            const target = await resolveCard(store, id);
            const card = await updateCardWithRetry(
              store,
              target.id,
              (current) => ({
                ...(options.title !== undefined ? { title: options.title } : {}),
                ...(options.status !== undefined ? { status: options.status } : {}),
                ...(options.priority !== undefined ? { priority: options.priority } : {}),
                ...(options.agent !== undefined ? { agentId: options.agent } : {}),
                ...(addLabels.length || removeLabels.length
                  ? {
                      labels: [
                        ...current.labels,
                        ...addLabels.filter((label) => !current.labels.includes(label)),
                      ].filter((label) => !removeLabels.includes(label)),
                    }
                  : {}),
                ...(notes !== undefined ? { notes } : {}),
                ...(appendNotes !== undefined
                  ? { notes: current.notes?.trim() ? `${current.notes.trimEnd()}\n\n${appendNotes}` : appendNotes }
                  : {}),
              }),
              options.expectRevision,
            );
            if (options.json) {
              out.json("card", { card: toCardDetail(card) });
              return;
            }
            printCardDetail(out, card);
          }
        );
      },
    );

  program
    .command("delete")
    .argument("<id>", "card id or a unique prefix of it")
    .description("delete a card permanently (its file and runtime state)")
    .option("--json", "print one JSON object (kind: card-deleted)")
    .addHelpText(
      "after",
      helpText({
        reads: "the card's file under .taskfold/cards/",
        writes:
          "removes that file and its state under .taskfold/.runtime/, and drops links to it from\n" +
          "          other cards",
        examples: ["taskfold delete 1a2b3c4d", "taskfold delete 1a2b3c4d --json"],
      }),
    )
    .action(async (id: string, options: JsonFlag) => {
      await withProject(
        run,
        async (store) => {
          const card = await resolveCard(store, id);
          const { deleted } = await store.delete(card.id);
          if (!deleted) {
            throw new TaskfoldCliError("NOT_FOUND", `card not found: ${card.id}`, { id: card.id });
          }
          if (options.json) {
            out.json("card-deleted", { id: card.id });
            return;
          }
          out.line(`Deleted ${card.id} (${card.title})`);
        }
      );
    });

  program
    .command("boards")
    .description("list the boards that have cards, with counts, and the default board for `create`")
    .option("--json", "print one JSON object (kind: board-list)")
    .addHelpText(
      "after",
      helpText({
        reads: "all cards under .taskfold/cards/",
        examples: ["taskfold boards", "taskfold boards --json"],
      }),
    )
    .action(async (options: JsonFlag) => {
      await withProject(
        run,
        async (store) => {
          const cards = await store.list();
          const inUse = new Set(boardsInUse(cards));
          const defaultBoardId = defaultBoardFor(cards) ?? null;
          const boards = (await store.listBoards()).boards
            .filter((board) => inUse.has(board.id) || board.id === defaultBoardId)
            .map((board) => ({
              id: board.id,
              total: board.total,
              active: board.active,
              archived: board.archived,
              byStatus: board.byStatus,
            }));
          if (options.json) {
            out.json("board-list", { defaultBoardId, boards });
            return;
          }
          for (const board of boards) {
            const marker = board.id === defaultBoardId ? "*" : " ";
            out.line(`${marker} ${board.id}  total ${board.total}  active ${board.active}  archived ${board.archived}`);
          }
          if (defaultBoardId === null) {
            out.line("Several boards are in use: pass --board <id> to `create`.");
          }
        }
      );
    });

  program
    .command("instructions")
    .description("print the detailed usage guide for AI agents (Markdown)")
    .option("--json", "print one JSON object (kind: instructions)")
    .addHelpText("after", helpText({ examples: ["taskfold instructions", "taskfold instructions --json"] }))
    .action((options: JsonFlag) => {
      const text = renderInstructions();
      if (options.json) {
        out.json("instructions", { version: TASKFOLD_CLI_VERSION, text });
        return;
      }
      run.stdout.write(text);
    });

  program
    .command("guidelines")
    .argument("[files...]", `files to update (default: ${DEFAULT_GUIDELINE_FILES.join(" and ")} at the repository root)`)
    .description(
      "insert or update the short, versioned Taskfold block in AGENTS.md / CLAUDE.md; rerunning " +
        "replaces the block in place instead of appending another one",
    )
    .option("--json", "print one JSON object (kind: guidelines)")
    .addHelpText(
      "after",
      helpText({
        reads: "the target files",
        writes:
          "each target file: the text between <!-- TASKFOLD GUIDELINES START vX --> and\n" +
          "          <!-- TASKFOLD GUIDELINES END -->, appended if absent; a missing file is created.\n" +
          "          Nothing else in the file changes. Does not need .taskfold/.",
        examples: ["taskfold guidelines", "taskfold guidelines CLAUDE.md --json", "taskfold guidelines docs/AGENTS.md"],
      }),
    )
    .action((files: string[], options: JsonFlag) => {
      const targets = files.length
        ? files.map((file) => path.resolve(run.cwd, file))
        : DEFAULT_GUIDELINE_FILES.map((file) => path.join(gitTopLevel(run.cwd) ?? path.resolve(run.cwd), file));
      const results = writeGuidelines(targets);
      if (options.json) {
        out.json("guidelines", { version: TASKFOLD_CLI_VERSION, files: results });
        return;
      }
      for (const result of results) {
        out.line(`${result.action.padEnd(9)} ${result.path}`);
      }
    });

  return program;
}

/** 跑一次 CLI，返回退出码。任何失败都在 stderr 输出一行 JSON 错误对象。 */
export async function runCli(run: RunCliOptions): Promise<number> {
  const out = new CliOutput(run.stdout, run.stderr, run.env);
  const program = buildProgram(run, out);
  try {
    await program.parseAsync(run.argv.length === 0 ? ["--help"] : [...run.argv], { from: "user" });
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.exitCode === 0) {
        return 0;
      }
      const usage = new TaskfoldCliError("INVALID_ARGUMENT", error.message.replace(/^error: /, ""));
      out.error(usage);
      return usage.exitCode;
    }
    const cliError = toCliError(error);
    out.error(cliError);
    return cliError.exitCode;
  }
}
