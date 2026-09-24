// Taskfold plugin module: 需求/16 R4 —— 外部变更检测 + 重盖 revision。
//
// 场景（新后端硬性语义规格.md「集成期发现 2」）：文件后端的 compareAndSwap 是同步的
// 「读 -> 比对 revision -> 写」，挡得住进程内并发，挡不住其他 OS 进程。用户用编辑器手工
// 改了一张卡片的 `.md` 文件（或者 `git checkout` / `git pull` 一次换掉几十个文件），内容
// 变了，但 `revision` 字段是这些外部写入者根本不认识的东西，留在磁盘上的还是旧值。UI 那
// 边如果还攥着这个旧 revision 提交一次修改，CAS 比对会通过——静默覆盖用户的手工改动。
// 唯一的补救：一发现文件被外部改过，立刻把它的 revision 重盖一次（+1），这样任何还持有
// 旧 expectedRevision 的调用者下一次 CAS 必然失败，走结构化冲突而不是覆盖。
//
// 需求/18 §3.7 之后：revision 与 md 内容 hash 都存在运行态文件里
// （file-store-card-runtime.ts），「变没变」按运行态记录的 `contentHash` 判断，不再有
// 进程内的哈希基线和自写标记——自己的写入会同时写下匹配的 hash，天然不会被误判，
// 多进程下也成立。重盖只改运行态文件，不再改写 md，且在卡锁内进行。写入方的 CAS
// 自己也会在卡锁内做同样的检测，这里的扫描只负责「尽早发现、广播变化」。
//
// 落点与分层理由：这段逻辑不放进 store-change-tracker.ts。那个类是后端无关的（SQLite
// 后端也在用它），只认「dataVersion() 返回的数字变了就 emit()」这一个不透明契约，绝不该
// 知道"卡片""Markdown 文件""内容哈希"这些文件系统细节。这里把探测 + 重盖整个包进
// 一个跟旧的 mtime 探测器同形状的 `dataVersion()` 函数里（见下方返回类型），
// file-store.ts 直接拿它替换掉原来接给 createTaskfoldFileStores() 的 mtime 探测器——
// store-change-tracker.ts / change-events.ts / store-core.ts 一行都不需要改，SQLite
// 后端的行为也完全不受影响（它有自己的 `PRAGMA data_version`，从不经过这个模块）。
//
// 判据分两层：
//   - "值不值得去扫一遍目录"：按每个文件的 (mtime, size) 做一次廉价的目录级指纹比对
//     （下面的 computeFingerprint）。⚠️ 这里故意**没有**拿"目录本身的 mtime"当探测
//     信号——POSIX 目录的 mtime 只在目录项本身增删/改名时才变，
//     "编辑器打开一个已存在的 .md 文件、原地保存"根本不改目录的 mtime（已用
//     `stat`实测确认），只改那个文件自己的 mtime。用目录级 mtime 当探测信号，会让最
//     常见的那类外部写入者（人手编辑现有文件）永远探测不到。所以这里改成扫每个文件
//     自己的 (mtime, size)。
//     指纹同时覆盖运行态目录：运行态文件被删（§3.7「运行态丢失」）也会触发一次扫描，
//     把缺失的运行态按当前 md 重新初始化。
//   - "这张卡片到底变没变"：永远按**内容哈希**判断，不看时间戳（R4 明确点名：mtime 是
//     秒级粒度，同一秒内两写会漏检）。哪怕上面那层指纹判断因为精度问题漏报了一轮，
//     下一次任意改动触发扫描时，`scanAndRestamp` 仍会用内容哈希把所有累积的漂移一次
//     性追平——指纹层只影响"多快发现"，从不影响"最终有没有正确重盖"。
import fs from "node:fs";
import path from "node:path";
import type { TaskfoldCard } from "./contract/index.js";
import { listFileNamesSafe, readFileIfExists } from "./file-store-atomic.js";
import {
  cardRuntimePath,
  hashCardFileContent,
  readCardRuntime,
  resolveCardRuntime,
  writeCardRuntime,
} from "./file-store-card-runtime.js";
import type { TaskfoldCardCodec } from "./file-store-codec.js";
import { isTaskfoldLockConflictError, tryWithTaskfoldCardLockSync } from "./file-store-locks.js";
import { extractTaskfoldSectionUuid } from "./markdown-card-format.js";

const CARD_EXTENSION = ".md";
const RUNTIME_EXTENSION = ".json";

function listFilesWithExtension(dir: string, extension: string): string[] {
  return listFileNamesSafe(dir).filter((name) => name.endsWith(extension));
}

/** 单个文件的廉价指纹：mtime + size 组合，只用来判断"值不值得去扫一遍"，从不用来判断
 * "这张卡片的内容到底变没变"（那个判断永远按内容哈希，见模块头注释）。 */
function statFingerprint(filePath: string): string | undefined {
  try {
    const stat = fs.statSync(filePath);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw err;
  }
}

/** 给一个目录拍一张「文件名 -> (mtime,size)」快照。 */
function computeFingerprint(dir: string, extension: string): Map<string, string> {
  const snapshot = new Map<string, string>();
  for (const fileName of listFilesWithExtension(dir, extension)) {
    const fingerprint = statFingerprint(path.join(dir, fileName));
    if (fingerprint !== undefined) {
      snapshot.set(fileName, fingerprint);
    }
  }
  return snapshot;
}

function fingerprintsEqual(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const [fileName, value] of a) {
    if (b.get(fileName) !== value) {
      return false;
    }
  }
  return true;
}

/** 上一轮扫描看到的 md 文件：指纹 + 从 TASKFOLD 区块认出的卡片 id（认不出为 undefined）。
 * 只是目录状态的快照，用于识别「坏文件新出现或被改」，不是自写标记。 */
type MdSnapshotEntry = { fingerprint: string; cardId?: string };

function cardIdOfRuntimeFile(fileName: string): string | undefined {
  try {
    return decodeURIComponent(fileName.slice(0, -RUNTIME_EXTENSION.length));
  } catch {
    return undefined;
  }
}

/** 只取卡片 id：优先走 TASKFOLD 区块的最小解析，认不出再退回 codec 全量解析
 * （兼容不产出 TASKFOLD 区块的 codec，如 JSON 占位 codec）。解析不了返回 undefined。 */
function cardIdOf(content: string, codec: TaskfoldCardCodec): string | undefined {
  const uuid = extractTaskfoldSectionUuid(content);
  if (uuid !== undefined) {
    return uuid;
  }
  try {
    return codec.parse(content).id;
  } catch {
    return undefined;
  }
}

export function createTaskfoldExternalChangeReconciler(options: {
  cardsDir: string;
  runtimeCardsDir: string;
  locksDir: string;
  codec: TaskfoldCardCodec;
}): {
  /**
   * 与旧的目录级 mtime 探测器同形状：一个不透明的、可能在调用期间顺带做一次
   * 「扫描 + 重盖」的计数器。`createTaskfoldFileStores()` 直接把它接到
   * `TaskfoldChangeTracker` 的 `dataVersion` 插槽上（见 store-change-tracker.ts）。
   */
  dataVersion: () => number;
} {
  const { cardsDir, runtimeCardsDir, locksDir, codec } = options;
  // 只在扫描确实发现外部改动时才递增（重盖/初始化了某张卡的运行态、坏文件新出现或被改、
  // 带运行态的卡片文件被外部删掉），与外层 TaskfoldChangeTracker 用它是否变化来决定要不要
  // emit() 的既有契约一致。自己的写入会同时写下匹配的 hash，不会让它递增。
  let version = 0;
  let mdSnapshot = new Map<string, MdSnapshotEntry>();
  let runtimeFingerprint = new Map<string, string>();
  // 上一轮扫描时「有运行态、没有 md」的卡片 id，用于只对新出现的孤儿计一次变化。
  let orphanIds = new Set<string>();
  // 上一轮有卡因为卡锁被占用没检查完：下一次 dataVersion() 无论指纹变没变都要重扫。
  let rescanPending = false;

  /** 卡锁内：重读 md 与运行态，按 hash 判定并落盘。返回是否写了运行态；锁被占用返回 undefined。 */
  function restampUnderLock(cardId: string, filePath: string): boolean | undefined {
    try {
      return tryWithTaskfoldCardLockSync(locksDir, cardId, filePath, (guard) => {
        const content = readFileIfExists(filePath);
        if (content === undefined) {
          return false;
        }
        let parsed: TaskfoldCard;
        try {
          parsed = codec.parse(content);
        } catch {
          return false;
        }
        const runtimePath = cardRuntimePath(runtimeCardsDir, cardId);
        const { runtime, changed } = resolveCardRuntime(content, parsed, readCardRuntime(runtimePath));
        if (changed) {
          writeCardRuntime(runtimePath, runtime, guard.assertHeld);
        }
        return changed;
      });
    } catch (error) {
      if (isTaskfoldLockConflictError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * 扫一遍 cardsDir：每个文件都要重新读并按内容哈希比对运行态（R4 明确禁止用单卡 mtime
   * 做判断），解析不出来的文件按 entries() 的容忍策略跳过，不让一个坏文件拖垮整轮扫描。
   * 返回这轮是否发现了外部改动。
   */
  function scanAndRestamp(): boolean {
    let external = false;
    let incomplete = false;
    const nextSnapshot = new Map<string, MdSnapshotEntry>();
    for (const fileName of listFilesWithExtension(cardsDir, CARD_EXTENSION)) {
      const filePath = path.join(cardsDir, fileName);
      const fingerprint = statFingerprint(filePath);
      const content = readFileIfExists(filePath);
      if (fingerprint === undefined || content === undefined) {
        continue;
      }
      const cardId = cardIdOf(content, codec);
      nextSnapshot.set(fileName, { fingerprint, cardId });
      if (cardId === undefined) {
        // 认不出是哪张卡（坏文件、非 Taskfold 文件）：没有 revision 可重盖，只在它新出现
        // 或被改动时算一次变化。
        if (mdSnapshot.get(fileName)?.fingerprint !== fingerprint) {
          external = true;
        }
        continue;
      }
      const stored = readCardRuntime(cardRuntimePath(runtimeCardsDir, cardId));
      if (stored && stored.contentHash === hashCardFileContent(content)) {
        continue;
      }
      // 运行态缺失或 hash 对不上：进卡锁重读后再判定（锁外看到的可能是别的写入方写完
      // md、还没写运行态的中间态）。
      const restamped = restampUnderLock(cardId, filePath);
      if (restamped === undefined) {
        incomplete = true;
      } else if (restamped) {
        external = true;
      }
    }
    // 外部删除：md 消失了而它的运行态还在（自己的 delete 会连运行态一起删），没有
    // revision 可重盖，只在孤儿新出现时算一次变化。运行态文件留着：同一张卡被
    // `git checkout` 带回来时，claim 与执行关联还能接上，内容不同则照常 revision +1。
    const liveIds = new Set([...nextSnapshot.values()].map((entry) => entry.cardId));
    const nextOrphanIds = new Set<string>();
    for (const fileName of listFilesWithExtension(runtimeCardsDir, RUNTIME_EXTENSION)) {
      const cardId = cardIdOfRuntimeFile(fileName);
      if (cardId === undefined || liveIds.has(cardId)) {
        continue;
      }
      nextOrphanIds.add(cardId);
      if (!orphanIds.has(cardId)) {
        external = true;
      }
    }
    orphanIds = nextOrphanIds;
    mdSnapshot = nextSnapshot;
    runtimeFingerprint = computeFingerprint(runtimeCardsDir, RUNTIME_EXTENSION);
    rescanPending = incomplete;
    return external;
  }

  function mdFingerprintUnchanged(): boolean {
    const current = computeFingerprint(cardsDir, CARD_EXTENSION);
    if (current.size !== mdSnapshot.size) {
      return false;
    }
    for (const [fileName, value] of current) {
      if (mdSnapshot.get(fileName)?.fingerprint !== value) {
        return false;
      }
    }
    return true;
  }

  // 构造时先扫一遍：给还没有运行态文件的卡（旧格式数据、新 clone）按当前 md 初始化运行态，
  // 这样之后对它们的手工编辑也能被 hash 检测到。这一轮不计入 version（不是运行期间的变化）。
  scanAndRestamp();

  return {
    dataVersion(): number {
      if (
        !rescanPending &&
        mdFingerprintUnchanged() &&
        fingerprintsEqual(computeFingerprint(runtimeCardsDir, RUNTIME_EXTENSION), runtimeFingerprint)
      ) {
        return version;
      }
      // 防自激：scanAndRestamp() 结束前会重新拍「重盖之后」的指纹，自己刚写的运行态不会在
      // 下一次调用时被当成又一轮改动；即便被扫到，hash 已对齐，也不会再重盖或递增。
      if (scanAndRestamp()) {
        version += 1;
      }
      return version;
    },
  };
}
