// `taskfold` CLI 的命令定义（需求/18 §4）。只暴露卡片的增删改查与状态流转，不暴露执行
// （claim / dispatch / launch 等）。`runCli` 不碰 process 全局（cwd、流、环境都由调用方给），
// 便于进程内测试；bin.ts 负责接上真实进程。
import fs from "node:fs";
import path from "node:path";
import { Command, CommanderError, InvalidArgumentError } from "commander";
import {
  isValidTaskfoldBoardId,
  TASKFOLD_PRIORITIES,
  TASKFOLD_STATUS_CATEGORIES,
  TASKFOLD_STATUS_ROLES,
  type TaskfoldCard,
  type TaskfoldStatusCategory,
  type TaskfoldStatusDefinition,
  type TaskfoldStatusRole,
} from "@taskfold/core/contract/index.js";
import {
  acceptsStatusInput,
  isRetiredTaskfoldStatusId,
  TASKFOLD_STATUS_ID_PATTERN,
  type TaskfoldStatusRegistry,
} from "@taskfold/core/status-registry.js";
import { cardPhase } from "@taskfold/core/card-phase.js";
import type { TaskfoldProjectStore } from "@taskfold/core/store-projects.js";
import {
  boardsInUse,
  defaultBoardFor,
  readCardDisplayIds,
  resolveCard,
  resolveCreateBoard,
  toCardDetail,
  toCardSummary,
  updateCardWithRetry,
  type CardDisplayIds,
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

/** 只检查写法；是不是该项目的状态要等打开项目、读到它的状态集之后才知道（见 assertKnownStatuses）。 */
function parseStatus(value: string): string {
  if (!TASKFOLD_STATUS_ID_PATTERN.test(value)) {
    throw new InvalidArgumentError(`status must be a status id: lowercase letters, digits, "-" or "_".`);
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

/** 阻塞 / 已派发 / 定时未到：这三种阶段在状态列里看不出来，行尾标出。 */
function phaseNote(phase: string): string {
  return phase === "blocked" || phase === "ready" || phase === "scheduled" ? `  (${phase})` : "";
}

function cardLine(out: CliOutput, card: TaskfoldCard, displayIds: CardDisplayIds, registry: TaskfoldStatusRegistry): string {
  const view = toCardSummary(card, displayIds, registry);
  const labels = view.labels.length ? `  [${view.labels.join(", ")}]` : "";
  const archived = view.archived ? "  (archived)" : "";
  return `${out.dim(view.displayId ?? view.shortId)}  ${out.status(view.status, 9)} ${view.priority.padEnd(6)}  ${view.boardId}  ${view.title}${labels}${phaseNote(view.phase)}${archived}`;
}

function printCardDetail(
  out: CliOutput,
  card: TaskfoldCard,
  displayIds: CardDisplayIds,
  registry: TaskfoldStatusRegistry,
): void {
  const view = toCardDetail(card, displayIds, registry);
  out.line(out.bold(view.title));
  const rows: Array<[string, string]> = [
    ["id", view.id],
    ["number", view.displayId ?? "-"],
    ["status", out.status(view.status)],
    ["phase", view.phase],
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
async function withProject<T>(
  run: RunCliOptions,
  body: (
    store: TaskfoldProjectStore,
    displayIds: CardDisplayIds,
    dataDir: string,
    registry: TaskfoldStatusRegistry,
  ) => Promise<T>,
): Promise<T> {
  const { store, dataDir } = openTaskfoldProject(run.cwd);
  // 状态集属于整个仓库（`.taskfold/config.yml`）：单项目后端不分看板，传不传 boardId 都一样。
  return await body(store, readCardDisplayIds(dataDir), dataDir, await store.statusRegistryFor(undefined));
}

/** 状态 id 必须在项目状态集里（旧的 ready / scheduled / blocked 仍接受，由 core 翻译成标记）。 */
function assertKnownStatuses(registry: TaskfoldStatusRegistry, statuses: readonly string[]): void {
  for (const status of statuses) {
    if (!acceptsStatusInput(registry, status)) {
      throw new TaskfoldCliError("INVALID_ARGUMENT", `status must be one of: ${registry.ids.join(", ")}.`, {
        status,
        statuses: [...registry.ids],
      });
    }
  }
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
    .option("--status <statuses>", "only these statuses, comma-separated (see `taskfold statuses`)", parseStatusList)
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
          async (store, displayIds, _dataDir, registry) => {
            assertKnownStatuses(registry, options.status ?? []);
            // 旧的 ready / scheduled / blocked 现在是阶段不是状态：`--status ready` 筛"已派发"的卡。
            const matchesStatus = (card: TaskfoldCard) =>
              !options.status?.length ||
              options.status.some((status) =>
                isRetiredTaskfoldStatusId(status) && !registry.has(status)
                  ? cardPhase(card, registry) === status
                  : card.status === status,
              );
            const cards = (await store.list(options.board ? { boardId: options.board } : {})).filter(
              (card) =>
                (options.includeArchived || !card.metadata?.archivedAt) &&
                matchesStatus(card) &&
                (!options.label || card.labels.includes(options.label)),
            );
            if (options.json) {
              out.json("card-list", { boardId: options.board ?? null, cards: cards.map((card) => toCardSummary(card, displayIds, registry)) });
              return;
            }
            if (cards.length === 0) {
              out.line("No cards.");
            }
            for (const card of cards) {
              out.line(cardLine(out, card, displayIds, registry));
            }
          }
        );
      },
    );

  program
    .command("show")
    .argument("<id>", "card UUID, unique UUID prefix, or card-N display number")
    .description("show one card, including its notes (the card body) and current revision")
    .option("--json", "print one JSON object (kind: card)")
    .addHelpText(
      "after",
      helpText({
        reads: "the card's file under .taskfold/cards/",
        examples: ["taskfold show card-1", "taskfold show 1a2b3c4d --json"],
      }),
    )
    .action(async (id: string, options: JsonFlag) => {
      await withProject(
        run,
        async (store, displayIds, _dataDir, registry) => {
          const card = await resolveCard(store, id, displayIds);
          if (options.json) {
            out.json("card", { card: toCardDetail(card, displayIds, registry) });
            return;
          }
          printCardDetail(out, card, displayIds, registry);
        }
      );
    });

  program
    .command("create")
    .argument("<title...>", "card title (several words are joined with spaces)")
    .description("create a card")
    .option("--notes <text>", "card body")
    .option("--notes-file <path>", "read the card body from a file (- for stdin)")
    .option("--status <status>", "initial status (default: the project's default, normally todo; see `taskfold statuses`)", parseStatus)
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
          status?: string;
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
          async (store, displayIds, dataDir, registry) => {
            if (options.status !== undefined) {
              assertKnownStatuses(registry, [options.status]);
            }
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
            displayIds = readCardDisplayIds(dataDir);
            if (options.json) {
              out.json("card", { card: toCardDetail(card, displayIds, registry) });
              return;
            }
            printCardDetail(out, card, displayIds, registry);
          }
        );
      },
    );

  program
    .command("update")
    .argument("<id>", "card UUID, unique UUID prefix, or card-N display number")
    .description(
      "change a card. Field flags are incremental and need no revision; replacing the whole " +
        "body (--notes / --notes-file) requires --expect-revision",
    )
    .option("--title <title>", "new title")
    .option("--status <status>", "move to this status (see `taskfold statuses`)", parseStatus)
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
          async (store, displayIds, _dataDir, registry) => {
            if (options.status !== undefined) {
              assertKnownStatuses(registry, [options.status]);
            }
            const target = await resolveCard(store, id, displayIds);
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
              out.json("card", { card: toCardDetail(card, displayIds, registry) });
              return;
            }
            printCardDetail(out, card, displayIds, registry);
          }
        );
      },
    );

  program
    .command("delete")
    .argument("<id>", "card UUID, unique UUID prefix, or card-N display number")
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
        async (store, displayIds, _dataDir, registry) => {
          const card = await resolveCard(store, id, displayIds);
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
    .command("attach")
    .argument("<id>", "card UUID, unique UUID prefix, or card-N display number")
    .argument("<file...>", "image file(s): png, jpg, gif, webp, avif or bmp")
    .description(
      "store image(s) in the card's folder under .taskfold/attachments/ and print the Markdown to reference them",
    )
    .option("--append-notes", "also append the image Markdown to the card body")
    .option("--json", "print one JSON object (kind: card-images)")
    .addHelpText(
      "after",
      helpText({
        reads: "the image files you pass, and the card's file under .taskfold/cards/",
        writes:
          ".taskfold/attachments/<card uuid>/<name>.<ext> (the first image upgrades the project to\n" +
          "          format_version 3: older Taskfold clients become read-only for it). With --append-notes,\n" +
          "          also the card's file. There is no size limit.",
        examples: [
          "taskfold attach card-3 shot.png",
          "taskfold attach card-3 a.png b.png --append-notes --json",
        ],
      }),
    )
    .action(async (id: string, files: string[], options: JsonFlag & { appendNotes?: boolean }) => {
      await withProject(
        run,
        async (store, displayIds, _dataDir, registry) => {
          const target = await resolveCard(store, id, displayIds);
          const images: Array<{
            file: string;
            name: string;
            ref: string;
            markdown: string;
            mimeType: string;
            byteSize: number;
          }> = [];
          for (const file of files) {
            let bytes: Buffer;
            try {
              bytes = fs.readFileSync(path.resolve(run.cwd, file));
            } catch (error) {
              throw new TaskfoldCliError("INVALID_ARGUMENT", `cannot read ${file}: ${(error as Error).message}`);
            }
            let stored;
            try {
              stored = await store.addCardImage(target.id, {
                fileName: path.basename(file),
                contentBase64: bytes.toString("base64"),
              });
            } catch (error) {
              // 非图片 / 空文件是输入问题，不是内部错误。
              if (/^card image /.test((error as Error).message)) {
                throw new TaskfoldCliError("INVALID_ARGUMENT", `${file}: ${(error as Error).message}`);
              }
              throw error;
            }
            const alt = path.basename(file, path.extname(file));
            images.push({
              file,
              name: stored.name,
              ref: stored.ref,
              markdown: `![${alt}](${stored.ref})`,
              mimeType: stored.mimeType,
              byteSize: stored.byteSize,
            });
          }
          let card: TaskfoldCard | undefined;
          if (options.appendNotes) {
            const addition = images.map((image) => image.markdown).join("\n\n");
            card = await updateCardWithRetry(store, target.id, (current) => ({
              notes: current.notes?.trim() ? `${current.notes.trimEnd()}\n\n${addition}` : addition,
            }));
          }
          if (options.json) {
            out.json("card-images", {
              cardId: target.id,
              images,
              card: card ? toCardDetail(card, displayIds, registry) : null,
            });
            return;
          }
          for (const image of images) {
            out.line(image.markdown);
          }
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
        async (store, displayIds, _dataDir, registry) => {
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

  const statusesCommand = program
    .command("statuses")
    .description(
      "show or change the project's statuses. Categories are fixed (unstarted, started, completed, cancelled); " +
        "the statuses inside them are the project's own and live in .taskfold/config.yml",
    );

  const printStatuses = (out2: CliOutput, statuses: readonly TaskfoldStatusDefinition[]) => {
    for (const status of statuses) {
      const flags = [status.role ? `role=${status.role}` : "", status.default ? "default" : ""].filter(Boolean);
      out2.line(
        `${status.id.padEnd(14)} ${status.category.padEnd(10)} ${(status.name ?? "").padEnd(12)} ${flags.join(" ")}`.trimEnd(),
      );
    }
  };
  const parseCategory = (value: string): TaskfoldStatusCategory => {
    if (!(TASKFOLD_STATUS_CATEGORIES as readonly string[]).includes(value)) {
      throw new InvalidArgumentError(`category must be one of: ${TASKFOLD_STATUS_CATEGORIES.join(", ")}.`);
    }
    return value as TaskfoldStatusCategory;
  };
  const parseRole = (value: string): TaskfoldStatusRole | "none" => {
    if (value !== "none" && !(TASKFOLD_STATUS_ROLES as readonly string[]).includes(value)) {
      throw new InvalidArgumentError(`role must be one of: ${TASKFOLD_STATUS_ROLES.join(", ")}, none.`);
    }
    return value as TaskfoldStatusRole | "none";
  };
  const findStatus = (list: readonly TaskfoldStatusDefinition[], statusId: string): number => {
    const index = list.findIndex((status) => status.id === statusId);
    if (index === -1) {
      throw new TaskfoldCliError("NOT_FOUND", `status not found: ${statusId}`, { status: statusId });
    }
    return index;
  };
  /** 角色与默认状态在项目里只能各有一个：给新状态设置时从原来的那个上摘掉。 */
  const takeExclusive = (
    list: TaskfoldStatusDefinition[],
    target: TaskfoldStatusDefinition,
    flags: { role?: TaskfoldStatusRole; makeDefault?: boolean },
  ) => {
    for (const status of list) {
      if (status.id === target.id) continue;
      if (flags.role && status.role === flags.role) delete status.role;
      if (flags.makeDefault && status.default) delete status.default;
    }
  };
  const saveAndPrint = async (
    store: TaskfoldProjectStore,
    next: TaskfoldStatusDefinition[],
    options: JsonFlag,
  ) => {
    const saved = await store.saveStatuses(undefined, next);
    if (options.json) {
      out.json("status-list", { configured: true, statuses: saved });
      return;
    }
    printStatuses(out, saved);
  };

  statusesCommand
    .command("list", { isDefault: true })
    .description("list the project's statuses in board order")
    .option("--json", "print one JSON object (kind: status-list)")
    .action(async (options: JsonFlag) => {
      await withProject(run, async (store, _displayIds, _dataDir, registry) => {
        const configured = await store.hasStatusConfig(undefined);
        const statuses = await store.listStatuses(undefined);
        if (options.json) {
          out.json("status-list", { configured, statuses });
          return;
        }
        printStatuses(out, statuses);
        if (!configured) {
          out.line("Defaults: run `taskfold migrate` to write this project's own statuses.");
        }
      });
    });

  statusesCommand
    .command("add")
    .argument("<id>", "status id (lowercase letters, digits, - or _)")
    .requiredOption("--category <category>", `category: ${TASKFOLD_STATUS_CATEGORIES.join(", ")}`, parseCategory)
    .option("--name <name>", "display name (default: a built-in name for the standard ids)")
    .option("--color <color>", "board column accent, e.g. #2563eb")
    .option("--role <role>", `engine role: ${TASKFOLD_STATUS_ROLES.join(", ")} (moves it from the status that has it)`, parseRole)
    .option("--default", "make this the status new cards start in (unstarted only)")
    .option("--before <id>", "insert before this status (default: after the last status of the same category)")
    .option("--json", "print one JSON object (kind: status-list)")
    .addHelpText("after", helpText({ writes: ".taskfold/config.yml (statuses; first write upgrades format_version to 4)", examples: ["taskfold statuses add testing --category started --name Testing --before review"] }))
    .action(async (statusId: string, options: JsonFlag & {
      category: TaskfoldStatusCategory;
      name?: string;
      color?: string;
      role?: TaskfoldStatusRole | "none";
      default?: boolean;
      before?: string;
    }) => {
      if (!TASKFOLD_STATUS_ID_PATTERN.test(statusId)) {
        throw new TaskfoldCliError("INVALID_ARGUMENT", `status id must match ${TASKFOLD_STATUS_ID_PATTERN}.`);
      }
      await withProject(run, async (store, _displayIds, _dataDir, registry) => {
        const list = (await store.listStatuses(undefined)).map((status) => ({ ...status }));
        if (list.some((status) => status.id === statusId)) {
          throw new TaskfoldCliError("REJECTED", `status already exists: ${statusId}`, { status: statusId });
        }
        const created: TaskfoldStatusDefinition = {
          id: statusId,
          category: options.category,
          ...(options.name ? { name: options.name } : {}),
          ...(options.color ? { color: options.color } : {}),
          ...(options.role && options.role !== "none" ? { role: options.role } : {}),
          ...(options.default ? { default: true } : {}),
        };
        takeExclusive(list, created, { role: created.role, makeDefault: options.default === true });
        const lastOfCategory = list.findLastIndex((status) => status.category === options.category);
        const at = options.before !== undefined ? findStatus(list, options.before) : lastOfCategory + 1;
        list.splice(at, 0, created);
        await saveAndPrint(store, list, options);
      });
    });

  statusesCommand
    .command("edit")
    .argument("<id>", "status id")
    .option("--name <name>", 'display name ("" clears it)')
    .option("--category <category>", `category: ${TASKFOLD_STATUS_CATEGORIES.join(", ")}`, parseCategory)
    .option("--color <color>", 'column accent ("" clears it)')
    .option("--role <role>", `engine role: ${TASKFOLD_STATUS_ROLES.join(", ")}, or none to clear`, parseRole)
    .option("--default", "make this the status new cards start in (unstarted only)")
    .option("--json", "print one JSON object (kind: status-list)")
    .action(async (statusId: string, options: JsonFlag & {
      name?: string;
      category?: TaskfoldStatusCategory;
      color?: string;
      role?: TaskfoldStatusRole | "none";
      default?: boolean;
    }) => {
      await withProject(run, async (store, _displayIds, _dataDir, registry) => {
        const list = (await store.listStatuses(undefined)).map((status) => ({ ...status }));
        const status = list[findStatus(list, statusId)]!;
        if (options.name !== undefined) {
          if (options.name === "") delete status.name;
          else status.name = options.name;
        }
        if (options.color !== undefined) {
          if (options.color === "") delete status.color;
          else status.color = options.color;
        }
        if (options.category !== undefined) status.category = options.category;
        if (options.role !== undefined) {
          if (options.role === "none") delete status.role;
          else status.role = options.role;
        }
        if (options.default) status.default = true;
        if (status.category !== "unstarted") delete status.default;
        takeExclusive(list, status, {
          ...(status.role ? { role: status.role } : {}),
          makeDefault: options.default === true,
        });
        await saveAndPrint(store, list, options);
      });
    });

  statusesCommand
    .command("move")
    .argument("<id>", "status id")
    .option("--before <id>", "put it before this status")
    .option("--after <id>", "put it after this status")
    .option("--json", "print one JSON object (kind: status-list)")
    .action(async (statusId: string, options: JsonFlag & { before?: string; after?: string }) => {
      exclusive(options, "before", "after", "--before", "--after");
      if (options.before === undefined && options.after === undefined) {
        throw new TaskfoldCliError("INVALID_ARGUMENT", "pass --before <id> or --after <id>.");
      }
      await withProject(run, async (store, _displayIds, _dataDir, registry) => {
        const list = (await store.listStatuses(undefined)).map((status) => ({ ...status }));
        const [moving] = list.splice(findStatus(list, statusId), 1);
        const anchor = findStatus(list, (options.before ?? options.after)!);
        list.splice(options.before !== undefined ? anchor : anchor + 1, 0, moving!);
        await saveAndPrint(store, list, options);
      });
    });

  statusesCommand
    .command("remove")
    .argument("<id>", "status id")
    .option("--move-cards-to <id>", "move the cards that use it to this status first (required when any do)")
    .option("--json", "print one JSON object (kind: status-list)")
    .action(async (statusId: string, options: JsonFlag & { moveCardsTo?: string }) => {
      await withProject(run, async (store, _displayIds, _dataDir, registry) => {
        findStatus(registry.list, statusId);
        const { statuses, moved } = await store.deleteStatus(undefined, statusId, {
          ...(options.moveCardsTo !== undefined ? { moveCardsTo: options.moveCardsTo } : {}),
        });
        if (options.json) {
          out.json("status-list", { configured: true, statuses, moved });
          return;
        }
        printStatuses(out, statuses);
        if (moved > 0) {
          out.line(`Moved ${moved} card(s) to ${options.moveCardsTo}.`);
        }
      });
    });

  program
    .command("migrate")
    .description(
      "migrate this repository's .taskfold/ to the status model (fixed categories + per-project statuses): " +
        "writes the project's `statuses` into config.yml and rewrites legacy ready / scheduled / blocked cards. " +
        "Safe to rerun; backs up first",
    )
    .option("--dry-run", "only print what would change; write nothing")
    .option("--json", "print one JSON object (kind: migration)")
    .addHelpText(
      "after",
      helpText({
        reads: "all cards under .taskfold/cards/ and the statuses in .taskfold/config.yml",
        writes:
          "<repo>/.taskfold/config.yml (statuses, format_version 4) and the cards that still carry a legacy\n" +
          "          status. A copy of cards/, milestones/ and config.yml goes to .taskfold/.runtime/backup-<time>/\n" +
          "          first. Older Taskfold versions open a migrated project read-only.",
        examples: ["taskfold migrate --dry-run", "taskfold migrate", "taskfold migrate --json"],
      }),
    )
    .action(async (options: JsonFlag & { dryRun?: boolean }) => {
      await withProject(run, async (store) => {
        const report = await store.migrateStatusModel(undefined, { dryRun: options.dryRun === true });
        if (options.json) {
          out.json("migration", report as unknown as Record<string, unknown>);
          return;
        }
        const counts = Object.entries(report.usage)
          .map(([status, count]) => `${status} ${count}`)
          .join(", ");
        out.line(`${report.total} cards: ${counts || "none"}`);
        out.line(`Statuses: ${report.statuses.map((status) => `${status.id} (${status.category})`).join(", ")}`);
        if (report.rewrites.length === 0 && !report.dryRun && !report.changed) {
          out.line("Already migrated; nothing to change.");
          return;
        }
        for (const rewrite of report.rewrites) {
          out.line(`  ${report.dryRun ? "would rewrite" : "rewrote"} ${rewrite.cardId}: ${rewrite.from} -> ${rewrite.to}`);
        }
        if (report.dryRun) {
          out.line("Dry run: nothing was written.");
          return;
        }
        if (report.backupDir) {
          out.line(`Backup: ${report.backupDir}`);
        }
        if (report.conflicts.length > 0) {
          out.line(`${report.conflicts.length} cards changed during the migration; run \`taskfold migrate\` again.`);
        }
      });
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
