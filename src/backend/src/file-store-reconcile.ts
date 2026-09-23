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
//   - "这张卡片到底变没变"：永远按**内容哈希**判断，不看时间戳（R4 明确点名：mtime 是
//     秒级粒度，同一秒内两写会漏检）。哪怕上面那层指纹判断因为精度问题漏报了一轮，
//     下一次任意改动触发扫描时，`scanAndRestamp` 仍会用内容哈希把所有累积的漂移一次
//     性追平——指纹层只影响"多快发现"，从不影响"最终有没有正确重盖"。
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { TaskfoldCard } from "../../contract/index.js";
import { listFileNamesSafe, readFileIfExists, writeFileAtomic } from "./file-store-atomic.js";
import type { TaskfoldCardCodec } from "./file-store-codec.js";
import { nextTaskfoldCardRevision } from "./store-constants.js";

const CARD_EXTENSION = ".md";

/**
 * 内容哈希故意排除 `revision`：这正是本模块自己要重写的字段。如果把它算进哈希，我们
 * 自己的重盖写入（只改了 revision 这一个字段）会在下一轮扫描时把自己的写误判成"又一次
 * 外部改动"，陷入"重盖 -> 哈希变 -> 又重盖"的自激循环（这就是任务要求专门测的"防自激"）。
 */
function hashCardContent(card: TaskfoldCard): string {
  const { revision, ...rest } = card;
  return createHash("sha256").update(JSON.stringify(rest)).digest("hex");
}

function listCardFiles(cardsDir: string): string[] {
  return listFileNamesSafe(cardsDir).filter((name) => name.endsWith(CARD_EXTENSION));
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

/** 给整个 cardsDir 拍一张「文件名 -> (mtime,size)」快照，用于跟上一次拍的快照比对，
 * 决定这次 dataVersion() 调用要不要触发真正的内容哈希扫描。 */
function computeFingerprint(cardsDir: string): Map<string, string> {
  const snapshot = new Map<string, string>();
  for (const fileName of listCardFiles(cardsDir)) {
    const fingerprint = statFingerprint(path.join(cardsDir, fileName));
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

export function createTaskfoldExternalChangeReconciler(options: {
  cardsDir: string;
  codec: TaskfoldCardCodec;
}): {
  /**
   * 与旧的目录级 mtime 探测器同形状：一个不透明的、可能在调用期间顺带做一次
   * 「扫描 + 重盖」的计数器。`createTaskfoldFileStores()` 直接把它接到
   * `TaskfoldChangeTracker` 的 `dataVersion` 插槽上（见 store-change-tracker.ts）。
   */
  dataVersion: () => number;
  /**
   * file-store-cards.ts 每一次成功的自己写（register / compareAndSwap /
   * registerIfAbsent 成功，或 delete 成功）都必须调用一次：`card` 是刚落盘、又原样
   * parse 回来的内容，`undefined` 表示这次是删除；`filePath` 是这次写/删所在的确切
   * 路径。用来让这次正常业务写入既不会被 `dataVersion()` 的指纹探测误判成外部改动，
   * 也不会在真正扫描时被内容哈希比对误判成"这张卡片又变了"从而被再重盖一次 revision。
   */
  noteOwnWrite: (cardId: string, card: TaskfoldCard | undefined, filePath: string) => void;
} {
  const { cardsDir, codec } = options;
  const knownHashes = new Map<string, string>();
  // 只在探测到真实指纹差异时才递增（无论那次扫描最终重盖了几张卡，哪怕是 0 张——比如
  // 只是外部删除了一个文件），与外层 TaskfoldChangeTracker 用它是否变化来决定要不要
  // emit() 的既有契约完全一致。
  let version = 0;

  // 两条基线都在构造时一次性建立，同一时刻拍下。这一步不可省：否则第一次真正探测到
  // "指纹变了"时，会把构造之前就已经存在、这个模块从没见过的每一张卡片全部当成"刚被
  // 外部改过"逐一重盖一遍——那是不必要的假阳性，会造成 revision 无谓跳号。
  let fingerprint = computeFingerprint(cardsDir);
  for (const fileName of listCardFiles(cardsDir)) {
    const content = readFileIfExists(path.join(cardsDir, fileName));
    if (content === undefined) {
      continue;
    }
    try {
      const card = codec.parse(content);
      knownHashes.set(card.id, hashCardContent(card));
    } catch {
      // 不是（或不再是）能解析的 Taskfold 卡片文件：不纳入基线。容忍策略与
      // file-store-cards.ts 的 entries()/findCardFilePath 一致——一个坏文件不该
      // 拖垮别的文件，之后也不必强行判定它"变了"。
    }
  }

  /**
   * 扫一遍 cardsDir：每个文件都要重新读 + 解析（R4 明确禁止用单卡 mtime 做判断，只能
   * 按内容哈希），解析不出来的文件按 entries() 的容忍策略跳过，不让一个坏文件拖垮整
   * 轮扫描。
   */
  function scanAndRestamp(): void {
    const seenIds = new Set<string>();
    for (const fileName of listCardFiles(cardsDir)) {
      const filePath = path.join(cardsDir, fileName);
      const content = readFileIfExists(filePath);
      if (content === undefined) {
        continue;
      }
      let card: TaskfoldCard;
      try {
        card = codec.parse(content);
      } catch {
        continue;
      }
      seenIds.add(card.id);
      const hash = hashCardContent(card);
      if (knownHashes.get(card.id) === hash) {
        continue;
      }
      // 内容变了（或者是这个 reconciler 从未见过的文件）：重盖 revision。`card` 就是
      // 刚从磁盘 parse 出来的整卡——只改 revision 这一个字段，绝不丢用户的其它改动。
      card.revision = nextTaskfoldCardRevision(card.revision);
      const rewritten = codec.serialize(card, content);
      writeFileAtomic(filePath, rewritten);
      // 用刚写下的字符串重新 parse 一遍来刷新基线，而不是直接假定"内容不变、只挪了
      // revision"：跟 file-store-cards.ts 的 writeCard 同一个理由——不依赖 serialize/
      // parse 在所有字段上都完全对称 round-trip 这个前提长期成立。
      knownHashes.set(card.id, hashCardContent(codec.parse(rewritten)));
    }
    // 外部删除：文件消失了，没有 revision 可重盖，只需要把基线里的旧记录清掉。
    for (const id of [...knownHashes.keys()]) {
      if (!seenIds.has(id)) {
        knownHashes.delete(id);
      }
    }
  }

  return {
    dataVersion(): number {
      const current = computeFingerprint(cardsDir);
      if (fingerprintsEqual(current, fingerprint)) {
        return version;
      }
      scanAndRestamp();
      // 防自激：scanAndRestamp() 的重盖写入本身会改动它写过的文件的 mtime/size，
      // 从而再次改变指纹。必须在返回前重新拍一张"重盖之后"的指纹，否则下一次
      // dataVersion() 调用会把我们自己刚刚写的这一笔当成又一轮外部改动——重新扫描一遍
      // 不会再错误地重盖任何东西（内容哈希已经对齐），但会让 TaskfoldChangeTracker
      // 误以为又有新变化要广播，是不该有的噪音，也是任务里明确要求锁住的"连续调两次,
      // 第二次不产生新的写"。
      fingerprint = computeFingerprint(cardsDir);
      version += 1;
      return version;
    },
    noteOwnWrite(cardId, card, filePath): void {
      if (card) {
        knownHashes.set(cardId, hashCardContent(card));
      } else {
        knownHashes.delete(cardId);
      }
      const fileName = path.basename(filePath);
      const written = card ? statFingerprint(filePath) : undefined;
      if (written !== undefined) {
        fingerprint.set(fileName, written);
      } else {
        fingerprint.delete(fileName);
      }
    },
  };
}
