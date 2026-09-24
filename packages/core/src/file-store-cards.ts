// Taskfold plugin module: the file-backed `cards` KeyedStore. This is the one store in
// the whole factory that must implement `compareAndSwap`/`registerIfAbsent` (R1) --
// every other store below in file-store.ts stays a plain register/lookup/delete/entries
// KV, matching sqlite-store.ts's own asymmetry (only TaskfoldSqliteCardStore implements
// CAS there too).
import path from "node:path";
import type { TaskfoldCard } from "./contract/index.js";
import type { PersistedTaskfoldCard, TaskfoldKeyedStore } from "./persistence-types.js";
import {
  createFileExclusive,
  listFileNamesSafe,
  readFileIfExists,
  removeFileIfExists,
  sameEntityId,
  sanitizeFilenameSegment,
  writeFileAtomic,
} from "./file-store-atomic.js";
import { allocateNextTaskfoldCardId } from "./file-store-card-id.js";
import {
  cardRuntimePath,
  hashCardFileContent,
  mergeCardRuntime,
  readCardRuntime,
  removeCardRuntime,
  resolveCardRuntime,
  splitCardRuntime,
  writeCardRuntime,
  type TaskfoldCardRuntime,
} from "./file-store-card-runtime.js";
import {
  isTaskfoldLockConflictError,
  TaskfoldLockTimeoutError,
  withTaskfoldCardLock,
  withTaskfoldGlobalLock,
  type TaskfoldLockGuard,
} from "./file-store-locks.js";
import type { TaskfoldCardCodec } from "./file-store-codec.js";
import { extractTaskfoldSectionUuid, parseCardFrontmatterId, type CardDisplayId } from "./markdown-card-format.js";

const CARD_EXTENSION = ".md";

function assertValidCardPayload(key: string, value: PersistedTaskfoldCard): void {
  if (value.version !== 1 || value.card.id !== key) {
    throw new Error("invalid taskfold card payload");
  }
}

/** `displayId` is the canonical "CARD-42" text (file-store-card-id.ts's
 * `allocateNextTaskfoldCardId` return shape, or the uppercased form recovered from an
 * existing file) -- lowercased here per 需求/16 第七节: frontmatter's `id` field is the
 * uppercase canonical form, but the filename segment is lowercase ("card-42 - ..."),
 * matching Backlog.md's own convention. */
function cardFileName(displayId: string, title: string): string {
  return `${displayId.toLowerCase()} - ${sanitizeFilenameSegment(title)}${CARD_EXTENSION}`;
}

/** Finds the file whose TASKFOLD section carries `uuid === id` (this store's `key` is
 * always `card.id`, the UUID business key -- see file-store-codec.ts's
 * `buildTaskfoldSectionJson`). Filenames no longer encode this id (只有展示 ID 才在文件名
 * 里，见 `cardFileName`/`allocateNewCardFile`), so this can no longer be a filename match:
 * it has to read each candidate file and pull its uuid out of the TASKFOLD block via
 * `extractTaskfoldSectionUuid` -- the minimal parse the 集成任务书要求的那种, not a full
 * `codec.parse`. A file that fails even that minimal parse is skipped (not this id's
 * file, not an error) rather than aborting the whole scan, matching `entries()`'s
 * one-bad-file-cannot-sink-the-rest philosophy. Already-measured cost: at the project's
 * target scale (2000 卡片时 164ms 全量 parse，81 张卡约 9.3ms，解析占其中 80~84%），这个
 * 只读 TASKFOLD 区块 uuid 的最小解析比全量 parseMarkdownCard 轻得多，扫目录找 uuid 完全
 * 可接受。 */
export function findCardFilePath(cardsDir: string, id: string): string | undefined {
  for (const fileName of listFileNamesSafe(cardsDir)) {
    if (!fileName.endsWith(CARD_EXTENSION)) {
      continue;
    }
    const filePath = path.join(cardsDir, fileName);
    const content = readFileIfExists(filePath);
    if (content === undefined) {
      continue;
    }
    const uuid = extractTaskfoldSectionUuid(content);
    if (uuid !== undefined && sameEntityId(uuid, id)) {
      return filePath;
    }
  }
  return undefined;
}

/** 真正的新卡（`findCardFilePath` 没找到既有文件）：扫 `cardsDir` + `archiveCardsDir` 分配
 * 一个从未被占用过的展示 ID（file-store-card-id.ts 的 `allocateNextTaskfoldCardId`，含
 * archive 目录，因为 ID 不回收），据此构造文件名，并把同一个展示 ID 一并返回给调用方，
 * 作为 `codec.serialize` 的 `displayIdHint` ——这样 frontmatter 里的 `id` 才会跟文件名用
 * 同一个数字，不会退化成 file-store-codec.ts 的占位兜底 "CARD-0"。 */
function allocateNewCardFile(
  cardsDir: string,
  archiveCardsDir: string,
  card: TaskfoldCard,
): { path: string; displayId: CardDisplayId } {
  const displayIdText = allocateNextTaskfoldCardId(cardsDir, archiveCardsDir);
  const displayId = parseCardFrontmatterId(displayIdText);
  if (!displayId) {
    // allocateNextTaskfoldCardId 的返回值总是 "PREFIX-<n>" 形态，这里只是防御性地不让一个
    // 不可能出现的解析失败悄悄写出坏 frontmatter。
    throw new Error(`taskfold file store: 分配器返回了无法解析的展示 ID "${displayIdText}"`);
  }
  return { path: path.join(cardsDir, cardFileName(displayIdText, card.title)), displayId };
}

/** 一张卡此刻在磁盘上的完整状态：md 原文、合并了运行态之后的整卡、当前应生效的运行态
 * （`runtimeChanged` 为 true 表示它与运行态文件不同——运行态缺失或 md 被外部改过，
 * 持卡锁的调用方应当写回，见 file-store-card-runtime.ts 的 `resolveCardRuntime`）。 */
type CardState = {
  content: string;
  card: TaskfoldCard;
  runtime: TaskfoldCardRuntime;
  runtimeChanged: boolean;
};

function readCardStateFromContent(
  content: string,
  codec: TaskfoldCardCodec,
  runtimeCardsDir: string,
  key?: string,
): CardState {
  const parsed = codec.parse(content);
  const stored = readCardRuntime(cardRuntimePath(runtimeCardsDir, key ?? parsed.id));
  const { runtime, changed } = resolveCardRuntime(content, parsed, stored);
  return {
    content,
    card: mergeCardRuntime(parsed, stored, runtime.revision),
    runtime,
    runtimeChanged: changed,
  };
}

function readCardState(
  filePath: string,
  codec: TaskfoldCardCodec,
  runtimeCardsDir: string,
  key: string,
): CardState | undefined {
  const content = readFileIfExists(filePath);
  return content === undefined ? undefined : readCardStateFromContent(content, codec, runtimeCardsDir, key);
}

/** Writes `value` either to its existing file (`existingPath`) or, for a genuinely new
 * card, to a freshly allocated `card-<n> - <title>.md` filename. `existingPath`, when
 * passed, also saves the caller from re-scanning the directory it already scanned once
 * to decide whether to take the CAS/registerIfAbsent branch.
 *
 * ⚠️ 需求/16 第七节附属决策：改标题不重命名文件（backlog 对 task 本就不重命名，见
 * markdown-card-format.ts 文件头「决策 5」）。所以当 `existingPath` 存在时，本函数
 * *始终*原地覆盖那个路径，从不重新按新标题计算文件名/重新分配展示 ID —— 与旧实现
 * （凡是标题变了就重命名）的行为不同。
 *
 * `previousContent`, when the caller already has it in hand (compareAndSwap read it to
 * check the revision anyway), is passed straight through to the codec so it does not
 * re-read the file it is about to overwrite. When the caller does not have it (plain
 * `register` on an existing key), this function reads `existingPath` itself -- the codec
 * needs that baseline to avoid discarding whatever it cannot round-trip through
 * `TaskfoldCard` alone (displayId, backlog-only frontmatter, Description/AC/DoD bodies,
 * unrecognized trailing prose; see file-store-codec.ts's `TaskfoldCardCodec` doc). A
 * genuinely new key (no `existingPath`) has no baseline to read, matching the codec's
 * `previousContent === undefined` "brand-new card" branch -- instead it gets a freshly
 * allocated `displayIdHint` (see `allocateNewCardFile`) so the frontmatter `id` and the
 * filename agree, instead of falling back to the codec's placeholder "CARD-0". */
/**
 * Returns the path written to plus the exact md string now on disk (unchanged baseline
 * when only runtime fields changed).
 * 运行态文件里的 `contentHash` 就是对这份字符串算的（需求/18 §3.7），调用方不必再读回。
 */
function writeCard(
  cardsDir: string,
  archiveCardsDir: string,
  runtimeCardsDir: string,
  value: PersistedTaskfoldCard,
  codec: TaskfoldCardCodec,
  existingPath: string | undefined,
  guard: TaskfoldLockGuard,
  previousContent?: string,
): { path: string; content: string } {
  // 需求/18 §3.7：运行态字段与 revision 不进 md。先写 md、后写运行态（顺序见
  // file-store-card-runtime.ts 模块头）；两次都是 tmp + rename，rename 前复查锁。
  const { mdCard, fields } = splitCardRuntime(value.card);
  let written: { path: string; content: string };
  if (existingPath) {
    const baseline = previousContent ?? readFileIfExists(existingPath);
    // 只改了运行态字段的写入（claim、heartbeat、execution、events……）不改写 md：沿用 md
    // 里原来的 updatedAt 序列化一遍，与磁盘字节相同就说明 md 字段没变，md 一个字节都不动；
    // 最后写入时间记在运行态的 updatedAt 里，读取时取两者较大者。
    const unchanged =
      baseline !== undefined &&
      codec.serialize({ ...mdCard, updatedAt: codec.parse(baseline).updatedAt }, baseline) === baseline;
    if (unchanged) {
      written = { path: existingPath, content: baseline };
    } else {
      const content = codec.serialize(mdCard, baseline);
      writeFileAtomic(existingPath, content, undefined, guard.assertHeld);
      written = { path: existingPath, content };
    }
  } else {
    const { path: newPath, displayId } = allocateNewCardFile(cardsDir, archiveCardsDir, value.card);
    const content = codec.serialize(mdCard, previousContent, displayId);
    writeFileAtomic(newPath, content, undefined, guard.assertHeld);
    written = { path: newPath, content };
  }
  writeCardRuntime(
    cardRuntimePath(runtimeCardsDir, value.card.id),
    {
      version: 1,
      revision: value.card.revision,
      contentHash: hashCardFileContent(written.content),
      updatedAt: value.card.updatedAt,
      fields,
    },
    guard.assertHeld,
  );
  return written;
}

export function createTaskfoldFileCardStore(options: {
  cardsDir: string;
  /** `<repo>/.taskfold/archive/cards`. Scanned (not written to) by the id allocator so
   * archived cards' ids stay retired -- see file-store-card-id.ts's module doc. */
  archiveCardsDir: string;
  attachmentsDir: string;
  codec: TaskfoldCardCodec;
  /** `<repo>/.taskfold/.locks`：两层跨进程锁的锁文件目录（file-store-locks.ts）。 */
  locksDir: string;
  /** `<repo>/.taskfold/.runtime/cards`：卡片运行态文件目录（需求/18 §3.7，file-store-card-runtime.ts）。 */
  runtimeCardsDir: string;
}): TaskfoldKeyedStore<PersistedTaskfoldCard> {
  const { cardsDir, archiveCardsDir, attachmentsDir, codec, locksDir, runtimeCardsDir } = options;

  /** 已有文件的卡：卡锁内无条件覆盖（register 语义是 last-writer-wins，但不能插进
   * 别人 CAS 的「重读 → rename」中间把对方的写吞掉）。
   * 写下的 revision 不低于「当前生效 revision + 1」（md 被外部改过时当前 revision 已被
   * 抬高），保证 revision 单调；与 stampCardRevisions 一样原地改 `value.card.revision`，
   * 让调用方手里的卡与落盘一致。 */
  async function overwriteExistingCard(key: string, filePath: string, value: PersistedTaskfoldCard) {
    await withTaskfoldCardLock(locksDir, key, filePath, (guard) => {
      const current = readCardState(filePath, codec, runtimeCardsDir, key);
      if (current) {
        value.card.revision = Math.max(value.card.revision, current.runtime.revision + 1);
      }
      writeCard(cardsDir, archiveCardsDir, runtimeCardsDir, value, codec, filePath, guard, current?.content);
    });
  }

  return {
    async register(key, value) {
      assertValidCardPayload(key, value);
      const existingPath = findCardFilePath(cardsDir, key);
      if (existingPath) {
        await overwriteExistingCard(key, existingPath, value);
        return;
      }
      // 新卡：全局锁内重查 + 分配展示 ID + 落盘，别的进程不会拿到同一个 ID。
      const racedPath = await withTaskfoldGlobalLock(locksDir, (guard) => {
        const raced = findCardFilePath(cardsDir, key);
        if (raced) {
          return raced;
        }
        writeCard(cardsDir, archiveCardsDir, runtimeCardsDir, value, codec, undefined, guard);
        return undefined;
      });
      if (racedPath) {
        // 拿全局锁之前另一个进程刚把同 key 的卡建出来：按已有卡覆盖（放掉全局锁后再拿卡锁，不嵌套）。
        await overwriteExistingCard(key, racedPath, value);
      }
    },

    async lookup(key) {
      // No cache anywhere in this path (R4): every call re-scans the directory and
      // re-reads+re-parses the file, so a write from any writer -- this store, another
      // instance of it, or (once R3/R4's detector is wired up) an external editor -- is
      // visible on the very next lookup.
      const filePath = findCardFilePath(cardsDir, key);
      if (!filePath) {
        return undefined;
      }
      // 运行态缺失或 md 被外部改过时，这里给出的 revision 与持锁写入方随后算出的一致
      // （file-store-card-runtime.ts 的 resolveCardRuntime），只是不落盘。
      const state = readCardState(filePath, codec, runtimeCardsDir, key);
      // A card can vanish between the directory scan and the read (a concurrent
      // delete); treat that exactly like "not found" rather than throwing (R8).
      return state ? { version: 1, card: state.card } : undefined;
    },

    async delete(key) {
      const filePath = findCardFilePath(cardsDir, key);
      if (!filePath) {
        return false;
      }
      // 卡锁内删除：不能插进别人 CAS 的「重读 → rename」中间（否则被删的卡会被那次 CAS 写回来）。
      const card = await withTaskfoldCardLock(locksDir, key, filePath, (guard) => {
        const current = readCardState(filePath, codec, runtimeCardsDir, key)?.card;
        guard.assertHeld();
        if (!removeFileIfExists(filePath)) {
          return undefined;
        }
        removeCardRuntime(cardRuntimePath(runtimeCardsDir, key));
        return { card: current };
      });
      if (!card) {
        return false;
      }
      // No ON DELETE CASCADE here (there is no database): explicitly clean up every
      // attachment blob this card referenced, mirroring what
      // TaskfoldSqliteCardStore.delete does inside its own transaction before the
      // SQL-level cascade fires. Missing blobs are ignored, not an error -- the
      // attachments store's own two-phase write (see file-store-attachments.ts) means a
      // half-finished attachment may never have had a blob to begin with.
      for (const attachment of card.card?.metadata?.attachments ?? []) {
        removeFileIfExists(path.join(attachmentsDir, attachment.id));
      }
      return true;
    },

    async entries() {
      const results: Array<{ key: string; value: PersistedTaskfoldCard }> = [];
      for (const fileName of listFileNamesSafe(cardsDir)) {
        if (!fileName.endsWith(CARD_EXTENSION)) {
          continue;
        }
        const filePath = path.join(cardsDir, fileName);
        const content = readFileIfExists(filePath);
        // Vanished between the directory listing and the read (a concurrent delete):
        // treat exactly like "not found", not an error.
        if (content === undefined) {
          continue;
        }
        let card: TaskfoldCard;
        try {
          card = readCardStateFromContent(content, codec, runtimeCardsDir).card;
        } catch (error) {
          // 任务 3：一个坏文件不能拖垮整份列表——否则所有卡片一起"蒸发"，比
          // Backlog.md 的静默 catch-skip 更糟（那边至少只丢一张）。跳过它，但绝不
          // 悄悄蒸发：console.warn 带上文件名与原因，供人工/未来的 doctor 诊断排查。
          // 这不是"卡片不存在"（R8 讲的是 lookup 对已删卡片的语义，不适用于这里的
          // 批量扫描场景），是"存在但读不出来"，两者不应该被混淆掉。
          console.warn(
            `taskfold file store: 跳过无法解析的卡片文件 "${fileName}": ${(error as Error).message}`,
          );
          continue;
        }
        results.push({ key: card.id, value: { version: 1, card } });
      }
      return results;
    },

    async compareAndSwap(key, expectedRevision, value, onReject) {
      assertValidCardPayload(key, value);
      const filePath = findCardFilePath(cardsDir, key);
      if (!filePath) {
        // Nothing to swap against -- mirrors sqlite-store.ts's `!row` branch.
        onReject?.("missing");
        return false;
      }
      try {
        // 需求/18 §3.4 写入流程：拿卡锁 → 重读 → 比对整数 revision → 写 tmp → rename → 放锁。
        return await withTaskfoldCardLock(locksDir, key, filePath, (guard) => {
          // Read the raw content once, ourselves (rather than via readCardAt), so it can be
          // handed straight to writeCard's `previousContent` param below -- compareAndSwap
          // already has to read this file to check the revision, so passing it on saves
          // writeCard a second read. Re-read *inside* the lock: whatever was on disk before
          // the lock was taken may already be stale.
          const current = readCardState(filePath, codec, runtimeCardsDir, key);
          if (current === undefined) {
            onReject?.("missing");
            return false;
          }
          // 需求/18 §3.7：比对 revision 之前先做外部修改检测。md 的 hash 与运行态记录的
          // 不一致（或运行态缺失）时，`current.runtime` 已是 revision +1 / 重新初始化之后的
          // 值——先把它落盘，再拿它比对，持旧 revision 的写入方因此被判冲突。
          if (current.runtimeChanged) {
            writeCardRuntime(cardRuntimePath(runtimeCardsDir, key), current.runtime, guard.assertHeld);
          }
          if (current.runtime.revision !== expectedRevision) {
            // R2: a stale/conflicting revision returns false, and the card itself is not written.
            onReject?.("revision");
            return false;
          }
          writeCard(cardsDir, archiveCardsDir, runtimeCardsDir, value, codec, filePath, guard, current.content);
          return true;
        });
      } catch (error) {
        // R2: lock contention (wait timeout) and a lock lost mid-write (compromised) are
        // conflicts, not errors -- report false so the compensation/retry loop handles it.
        // Neither path has written anything (see writeFileAtomic's beforeRename).
        if (isTaskfoldLockConflictError(error)) {
          onReject?.(error instanceof TaskfoldLockTimeoutError ? "lock-timeout" : "lock-compromised");
          return false;
        }
        throw error;
      }
    },

    async registerIfAbsent(key, value) {
      assertValidCardPayload(key, value);
      if (findCardFilePath(cardsDir, key)) {
        return false;
      }
      // 全局锁内完成「重查是否存在 + 分配展示 ID + 独占创建」：两个进程不会拿到同一个
      // 展示 ID，也不会给同一个 key 各建一个文件。同 writeCard 的"真新卡"分支，把展示 ID
      // 当 displayIdHint 传给 codec，避免退化成占位 "CARD-0"。
      return await withTaskfoldGlobalLock(locksDir, (guard) => {
        if (findCardFilePath(cardsDir, key)) {
          return false;
        }
        const { path: newPath, displayId } = allocateNewCardFile(cardsDir, archiveCardsDir, value.card);
        const { mdCard, fields } = splitCardRuntime(value.card);
        const content = codec.serialize(mdCard, undefined, displayId);
        guard.assertHeld();
        // Exclusive create (O_EXCL) rather than the tmp+rename used elsewhere: this is the
        // one card write where "someone else already created this key" must fail loudly
        // enough to return false instead of silently overwriting -- see
        // file-store-atomic.ts's `createFileExclusive`.
        const created = createFileExclusive(newPath, content);
        if (created) {
          writeCardRuntime(
            cardRuntimePath(runtimeCardsDir, key),
            {
              version: 1,
              revision: value.card.revision,
              contentHash: hashCardFileContent(content),
              updatedAt: value.card.updatedAt,
              fields,
            },
            guard.assertHeld,
          );
        }
        return created;
      });
    },
  };
}
