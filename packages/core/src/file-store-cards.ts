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
  isTaskfoldLockConflictError,
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
function findCardFilePath(cardsDir: string, id: string): string | undefined {
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

function readCardAt(filePath: string, codec: TaskfoldCardCodec): TaskfoldCard | undefined {
  const content = readFileIfExists(filePath);
  return content === undefined ? undefined : codec.parse(content);
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
 * Returns the path written to plus the exact serialized string that landed on disk (not
 * `value.card` itself): 需求/16 R4 的外部改动探测器（file-store-reconcile.ts）需要一份
 * "跟未来重新读这个文件、重新 parse 出来的结果保证一致"的基线去算内容哈希。`value.card`
 * 是序列化*之前*的对象——如果 codec 的 serialize/parse 在某个字段上不是完全对称的
 * round-trip（例如 R6 提到的某些边界情况），直接哈希 `value.card` 就可能跟"下一次扫描时
 * 重新读+重新 parse 出来的结果"不一致，从而把这次自己的写误判成外部改动。返回刚写下的
 * 字符串,让调用方对*同一份字符串*调用 `codec.parse`,从根源上消除这个假设。
 */
function writeCard(
  cardsDir: string,
  archiveCardsDir: string,
  value: PersistedTaskfoldCard,
  codec: TaskfoldCardCodec,
  existingPath: string | undefined,
  guard: TaskfoldLockGuard,
  previousContent?: string,
): { path: string; content: string } {
  if (existingPath) {
    const baseline = previousContent ?? readFileIfExists(existingPath);
    const content = codec.serialize(value.card, baseline);
    writeFileAtomic(existingPath, content, undefined, guard.assertHeld);
    return { path: existingPath, content };
  }
  const { path: newPath, displayId } = allocateNewCardFile(cardsDir, archiveCardsDir, value.card);
  const content = codec.serialize(value.card, previousContent, displayId);
  writeFileAtomic(newPath, content, undefined, guard.assertHeld);
  return { path: newPath, content };
}

export function createTaskfoldFileCardStore(options: {
  cardsDir: string;
  /** `<repo>/.taskfold/archive/cards`. Scanned (not written to) by the id allocator so
   * archived cards' ids stay retired -- see file-store-card-id.ts's module doc. */
  archiveCardsDir: string;
  attachmentsDir: string;
  codec: TaskfoldCardCodec;
  /**
   * 需求/16 R4：每一次成功的自己写（`card` 是刚落盘、又原样 parse 回来的内容，`filePath`
   * 是落盘的确切路径）或成功的删除（`card` 为 `undefined`，`filePath` 是被删的路径）都要
   * 调用一次，供 file-store-reconcile.ts 的外部改动探测器刷新它的基线——否则这次正常业
   * 务写入会在下一轮扫描时被误判成"外部又改了一次"，被再重盖一次 revision。
   */
  onWrite?: (cardId: string, card: TaskfoldCard | undefined, filePath: string) => void;
  /** `<repo>/.taskfold/.locks`：两层跨进程锁的锁文件目录（file-store-locks.ts）。 */
  locksDir: string;
}): TaskfoldKeyedStore<PersistedTaskfoldCard> {
  const { cardsDir, archiveCardsDir, attachmentsDir, codec, onWrite, locksDir } = options;

  /** 已有文件的卡：卡锁内无条件覆盖（register 语义是 last-writer-wins，但不能插进
   * 别人 CAS 的「重读 → rename」中间把对方的写吞掉）。 */
  async function overwriteExistingCard(key: string, filePath: string, value: PersistedTaskfoldCard) {
    await withTaskfoldCardLock(locksDir, key, filePath, (guard) => {
      const written = writeCard(cardsDir, archiveCardsDir, value, codec, filePath, guard);
      onWrite?.(key, codec.parse(written.content), written.path);
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
        const written = writeCard(cardsDir, archiveCardsDir, value, codec, undefined, guard);
        onWrite?.(key, codec.parse(written.content), written.path);
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
      const card = readCardAt(filePath, codec);
      // A card can vanish between the directory scan and the read (a concurrent
      // delete); treat that exactly like "not found" rather than throwing (R8).
      return card ? { version: 1, card } : undefined;
    },

    async delete(key) {
      const filePath = findCardFilePath(cardsDir, key);
      if (!filePath) {
        return false;
      }
      // 卡锁内删除：不能插进别人 CAS 的「重读 → rename」中间（否则被删的卡会被那次 CAS 写回来）。
      const card = await withTaskfoldCardLock(locksDir, key, filePath, (guard) => {
        const current = readCardAt(filePath, codec);
        guard.assertHeld();
        if (!removeFileIfExists(filePath)) {
          return undefined;
        }
        onWrite?.(key, undefined, filePath);
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
          card = codec.parse(content);
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

    async compareAndSwap(key, expectedRevision, value) {
      assertValidCardPayload(key, value);
      const filePath = findCardFilePath(cardsDir, key);
      if (!filePath) {
        // Nothing to swap against -- mirrors sqlite-store.ts's `!row` branch.
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
          const previousContent = readFileIfExists(filePath);
          if (previousContent === undefined) {
            return false;
          }
          const current = codec.parse(previousContent);
          if (current.revision !== expectedRevision) {
            // R2: a stale/conflicting revision returns false, and nothing is written.
            return false;
          }
          const written = writeCard(cardsDir, archiveCardsDir, value, codec, filePath, guard, previousContent);
          onWrite?.(key, codec.parse(written.content), written.path);
          return true;
        });
      } catch (error) {
        // R2: lock contention (wait timeout) and a lock lost mid-write (compromised) are
        // conflicts, not errors -- report false so the compensation/retry loop handles it.
        // Neither path has written anything (see writeFileAtomic's beforeRename).
        if (isTaskfoldLockConflictError(error)) {
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
        const content = codec.serialize(value.card, undefined, displayId);
        guard.assertHeld();
        // Exclusive create (O_EXCL) rather than the tmp+rename used elsewhere: this is the
        // one card write where "someone else already created this key" must fail loudly
        // enough to return false instead of silently overwriting -- see
        // file-store-atomic.ts's `createFileExclusive`.
        const created = createFileExclusive(newPath, content);
        if (created) {
          onWrite?.(key, codec.parse(content), newPath);
        }
        return created;
      });
    },
  };
}
