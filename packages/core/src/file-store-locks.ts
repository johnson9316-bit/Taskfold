// Taskfold plugin module: 文件后端的两层跨进程锁（需求/18 §3.4）。
//
// - 全局锁 `.locks/global.lock`：只管 ID 分配、新建卡片、change revision 预留。
// - 卡锁 `.locks/card-<key>.lock`：每张卡一把，锁目标是卡片文件本身，保护这张卡的
//   「重读 → 比对 revision → 写 tmp → rename」。
//
// 两层锁都不嵌套持有（本模块的调用方从不在持有一把锁时再去拿另一把），所以不存在
// 加锁顺序问题。以后若出现一次持有多把卡锁的跨卡操作，必须先按卡片 key 排序再依次加锁。
//
// 临界区（`section` 回调）必须是**同步**的：拿到锁以后到放锁之前不让出事件循环。
// 这样 proper-lockfile 的 mtime 刷新定时器在临界区内不会运行，`assertHeld()` 才能
// 用「锁文件 mtime 仍是拿锁时那个值」判断锁没有被别的进程按 stale 规则抢走。
import fs from "node:fs";
import path from "node:path";
import lockfile from "proper-lockfile";

/**
 * 锁文件多久没刷新 mtime 就被视为 stale、可被别的进程抢走（ms）。所有宿主必须一致
 * （proper-lockfile 检测不到参数不一致），所以写死在这里、不开放配置。
 * 取库默认值 10s：远大于任何一次临界区（ms 级同步文件读写，2000 卡全量解析也只 164ms），
 * 又足够短，进程崩溃遗留的锁最多挡 10s。
 */
export const TASKFOLD_LOCK_STALE_MS = 10_000;
/** 持锁期间刷新锁文件 mtime 的间隔（ms）。取 stale/2（库默认值，也是库允许的上限）。 */
export const TASKFOLD_LOCK_UPDATE_MS = TASKFOLD_LOCK_STALE_MS / 2;
/** 抢锁最多等多久（ms），超时由调用方映射为冲突（CAS 返回 false，需求/16 R2）。 */
export const TASKFOLD_LOCK_WAIT_MS = 2_000;
/** 两次抢锁之间的随机退避区间（ms），随机化避免多个等待者同步撞车。 */
const TASKFOLD_LOCK_RETRY_MIN_MS = 10;
const TASKFOLD_LOCK_RETRY_MAX_MS = 50;

/** 在 {@link TASKFOLD_LOCK_WAIT_MS} 内没拿到锁。 */
export class TaskfoldLockTimeoutError extends Error {
  readonly code = "ELOCKTIMEOUT";

  constructor(lockfilePath: string) {
    super(`taskfold file store: 等锁超时（${TASKFOLD_LOCK_WAIT_MS}ms）：${lockfilePath}`);
    this.name = "TaskfoldLockTimeoutError";
  }
}

/** 持锁期间锁被判定 stale 并被别人抢走（进程被挂起超过 stale 时间等），本次写入已放弃。 */
export class TaskfoldLockCompromisedError extends Error {
  readonly code = "ECOMPROMISED";

  constructor(lockfilePath: string) {
    super(`taskfold file store: 锁已失效（被其他进程接管）：${lockfilePath}`);
    this.name = "TaskfoldLockCompromisedError";
  }
}

/** 锁竞争类失败（超时或失效）。CAS 路径据此返回 false 而不是 throw（需求/16 R2）。 */
export function isTaskfoldLockConflictError(error: unknown): boolean {
  return error instanceof TaskfoldLockTimeoutError || error instanceof TaskfoldLockCompromisedError;
}

export type TaskfoldLockGuard = {
  /** 在真正落盘（rename / 独占创建 / 删除）之前调用：锁已失效则抛 {@link TaskfoldLockCompromisedError}。 */
  assertHeld(): void;
};

export function taskfoldGlobalLockPath(locksDir: string): string {
  return path.join(locksDir, "global.lock");
}

export function taskfoldCardLockPath(locksDir: string, cardKey: string): string {
  return path.join(locksDir, `card-${encodeURIComponent(cardKey)}.lock`);
}

type HeldLock = { lockfilePath: string; mtimeMs: number; compromised: boolean };

function lockOptions(held: HeldLock): lockfile.LockOptions {
  return {
    lockfilePath: held.lockfilePath,
    realpath: false,
    stale: TASKFOLD_LOCK_STALE_MS,
    update: TASKFOLD_LOCK_UPDATE_MS,
    retries: 0,
    // 默认实现是在定时器里 throw，会直接打崩进程。这里只记下来，由 assertHeld 放弃写入。
    onCompromised: () => {
      held.compromised = true;
    },
  };
}

function isLockedError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ELOCKED";
}

function retryDelayMs(): number {
  return (
    TASKFOLD_LOCK_RETRY_MIN_MS +
    Math.floor(Math.random() * (TASKFOLD_LOCK_RETRY_MAX_MS - TASKFOLD_LOCK_RETRY_MIN_MS + 1))
  );
}

function guardFor(held: HeldLock): TaskfoldLockGuard {
  return {
    assertHeld() {
      if (held.compromised) {
        throw new TaskfoldLockCompromisedError(held.lockfilePath);
      }
      let mtimeMs: number;
      try {
        mtimeMs = fs.statSync(held.lockfilePath).mtimeMs;
      } catch {
        throw new TaskfoldLockCompromisedError(held.lockfilePath);
      }
      if (mtimeMs !== held.mtimeMs) {
        throw new TaskfoldLockCompromisedError(held.lockfilePath);
      }
    },
  };
}

function newHeldLock(lockfilePath: string): HeldLock {
  fs.mkdirSync(path.dirname(lockfilePath), { recursive: true });
  return { lockfilePath, mtimeMs: 0, compromised: false };
}

function runSection<T>(held: HeldLock, section: (guard: TaskfoldLockGuard) => T): {
  result?: T;
  error?: unknown;
  release: boolean;
} {
  try {
    return { result: section(guardFor(held)), release: true };
  } catch (error) {
    // 锁已经不归我们：此时放锁会把接管者的锁目录删掉，所以不放，交给
    // proper-lockfile 的刷新定时器发现后走 onCompromised 清理内部状态。
    return { error, release: !(error instanceof TaskfoldLockCompromisedError) };
  }
}

/** 拿锁 → 同步执行 `section` → 放锁。等锁超时抛 {@link TaskfoldLockTimeoutError}。 */
export async function withTaskfoldFileLock<T>(
  target: string,
  lockfilePath: string,
  section: (guard: TaskfoldLockGuard) => T,
): Promise<T> {
  const held = newHeldLock(lockfilePath);
  const deadline = Date.now() + TASKFOLD_LOCK_WAIT_MS;
  let release: () => Promise<void>;
  for (;;) {
    try {
      release = await lockfile.lock(target, lockOptions(held));
      break;
    } catch (error) {
      if (!isLockedError(error)) {
        throw error;
      }
      const delay = retryDelayMs();
      if (Date.now() + delay > deadline) {
        throw new TaskfoldLockTimeoutError(lockfilePath);
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  held.mtimeMs = fs.statSync(lockfilePath).mtimeMs;
  const outcome = runSection(held, section);
  if (outcome.release) {
    // 放锁失败（ERELEASED 等）不影响已经完成的写入；残留锁会按 stale 规则被回收。
    await release().catch(() => {});
  }
  if ("error" in outcome) {
    throw outcome.error;
  }
  return outcome.result as T;
}

const syncSleepCell = new Int32Array(new SharedArrayBuffer(4));

/**
 * {@link withTaskfoldFileLock} 的同步版，给调用链本身是同步的地方用
 * （`reserveChangeRevisions` 的签名是同步的，见 store-change-tracker.ts）。
 * 等锁期间会阻塞事件循环，最多 {@link TASKFOLD_LOCK_WAIT_MS}。
 */
export function withTaskfoldFileLockSync<T>(
  target: string,
  lockfilePath: string,
  section: (guard: TaskfoldLockGuard) => T,
  /** 最多等多久（ms）；传 0 表示只试一次，锁被占用立即抛 {@link TaskfoldLockTimeoutError}。 */
  waitMs: number = TASKFOLD_LOCK_WAIT_MS,
): T {
  const held = newHeldLock(lockfilePath);
  const deadline = Date.now() + waitMs;
  let release: () => void;
  for (;;) {
    try {
      release = lockfile.lockSync(target, lockOptions(held));
      break;
    } catch (error) {
      if (!isLockedError(error)) {
        throw error;
      }
      const delay = retryDelayMs();
      if (Date.now() + delay > deadline) {
        throw new TaskfoldLockTimeoutError(lockfilePath);
      }
      Atomics.wait(syncSleepCell, 0, 0, delay);
    }
  }
  held.mtimeMs = fs.statSync(lockfilePath).mtimeMs;
  const outcome = runSection(held, section);
  if (outcome.release) {
    try {
      release();
    } catch {
      // 同上：放锁失败不影响已完成的写入。
    }
  }
  if ("error" in outcome) {
    throw outcome.error;
  }
  return outcome.result as T;
}

/** 全局锁：ID 分配、新建卡片。 */
export async function withTaskfoldGlobalLock<T>(
  locksDir: string,
  section: (guard: TaskfoldLockGuard) => T,
): Promise<T> {
  const lockfilePath = taskfoldGlobalLockPath(locksDir);
  return await withTaskfoldFileLock(lockfilePath.slice(0, -".lock".length), lockfilePath, section);
}

/** 全局锁的同步版：change revision 预留。 */
export function withTaskfoldGlobalLockSync<T>(
  locksDir: string,
  section: (guard: TaskfoldLockGuard) => T,
): T {
  const lockfilePath = taskfoldGlobalLockPath(locksDir);
  return withTaskfoldFileLockSync(lockfilePath.slice(0, -".lock".length), lockfilePath, section);
}

/** 卡锁：锁目标是卡片文件本身，锁文件按卡片 key 放在 `locksDir` 下。 */
export async function withTaskfoldCardLock<T>(
  locksDir: string,
  cardKey: string,
  cardFilePath: string,
  section: (guard: TaskfoldLockGuard) => T,
): Promise<T> {
  return await withTaskfoldFileLock(cardFilePath, taskfoldCardLockPath(locksDir, cardKey), section);
}

/**
 * 卡锁的同步「只试一次」版：外部变更探测（file-store-reconcile.ts 的 `dataVersion()` 是
 * 同步契约）用。锁被占用时立即抛 {@link TaskfoldLockTimeoutError}，不等待——同步等锁会阻塞
 * 事件循环，而占着锁的可能正是本进程里一个等着异步放锁的写入，等下去只会白等满超时。
 */
export function tryWithTaskfoldCardLockSync<T>(
  locksDir: string,
  cardKey: string,
  cardFilePath: string,
  section: (guard: TaskfoldLockGuard) => T,
): T {
  return withTaskfoldFileLockSync(cardFilePath, taskfoldCardLockPath(locksDir, cardKey), section, 0);
}
