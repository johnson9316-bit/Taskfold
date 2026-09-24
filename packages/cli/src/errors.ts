// CLI 的稳定错误码（需求/18 §4）。失败时 stderr 输出一行 JSON：
// `{"schemaVersion":1,"kind":"error","error":{"code":"...","message":"...","details":{...}}}`，
// 退出码按下表取非零值。错误码与退出码都是对外契约，改动要同步 README 与 instructions。
import { TaskfoldFormatTooNewError } from "@taskfold/core/file-store-format.js";
import { TaskfoldLockCompromisedError, TaskfoldLockTimeoutError } from "@taskfold/core/file-store-locks.js";
import { TaskfoldRevisionConflictError } from "@taskfold/core/store-core.js";

/** 错误码 → 退出码。 */
export const TASKFOLD_CLI_EXIT_CODES = {
  /** 意料之外的内部错误（含 I/O 错误）。 */
  INTERNAL: 1,
  /** 参数不合法：未知选项、缺参数、取值不在允许范围内、互斥选项同时出现。 */
  INVALID_ARGUMENT: 2,
  /** 整体替换正文（`--notes` / `--notes-file`）没带 `--expect-revision`。 */
  REVISION_REQUIRED: 2,
  /** 从当前目录往上找不到 `.taskfold/`（先跑 `taskfold init`）。 */
  NOT_INITIALIZED: 3,
  /** 卡片 id（或前缀）不存在。 */
  NOT_FOUND: 4,
  /** id 前缀命中多张卡，或仓库里有多个 board 而没给 `--board`。 */
  AMBIGUOUS: 4,
  /** revision 冲突：卡片在你读到的 revision 之后被改过。 */
  CONFLICT: 5,
  /** 等锁超时：别的进程一直占着锁（需求/18 §3.4，约 2 秒）。 */
  LOCKED: 6,
  /** `.taskfold/config.yml` 的 format_version 比本版 CLI 新：只读，写入被拒。 */
  FORMAT_TOO_NEW: 7,
  /** core 拒绝了这次操作（字段校验、状态约束等），原因见 message。 */
  REJECTED: 8,
} as const;

export type TaskfoldCliErrorCode = keyof typeof TASKFOLD_CLI_EXIT_CODES;

export class TaskfoldCliError extends Error {
  readonly code: TaskfoldCliErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: TaskfoldCliErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "TaskfoldCliError";
    this.code = code;
    if (details) {
      this.details = details;
    }
  }

  get exitCode(): number {
    return TASKFOLD_CLI_EXIT_CODES[this.code];
  }
}

/**
 * core 抛出的错误 → CLI 错误码。
 *
 * ⚠️ 锁超时在 store 层与 revision 冲突是同一个 `false`（需求/16 R2），业务层统一抛
 * {@link TaskfoldRevisionConflictError}；只能靠它的 `reason`（core 从 compareAndSwap 的
 * `onReject` 带出）区分 LOCKED 与 CONFLICT。非 CAS 的写入（新建卡片、删除）等锁超时直接抛
 * {@link TaskfoldLockTimeoutError}。锁失效（compromised）按需求/18 §3.4「放弃写入、按冲突上报」
 * 归 CONFLICT。
 */
export function toCliError(error: unknown): TaskfoldCliError {
  if (error instanceof TaskfoldCliError) {
    return error;
  }
  if (error instanceof TaskfoldRevisionConflictError) {
    const details = { id: error.cardId, expectedRevision: error.expectedRevision, reason: error.reason };
    switch (error.reason) {
      case "lock-timeout":
        return new TaskfoldCliError("LOCKED", `card ${error.cardId} is locked by another process; retry shortly.`, details);
      case "missing":
        return new TaskfoldCliError("NOT_FOUND", `card not found: ${error.cardId}`, details);
      default:
        return new TaskfoldCliError(
          "CONFLICT",
          `card ${error.cardId} changed since revision ${error.expectedRevision}; re-read it and retry.`,
          details,
        );
    }
  }
  if (error instanceof TaskfoldLockTimeoutError) {
    return new TaskfoldCliError("LOCKED", "the Taskfold data is locked by another process; retry shortly.", {
      reason: "lock-timeout",
    });
  }
  if (error instanceof TaskfoldLockCompromisedError) {
    return new TaskfoldCliError("CONFLICT", "the lock was taken over by another process; the write was abandoned.", {
      reason: "lock-compromised",
    });
  }
  if (error instanceof TaskfoldFormatTooNewError) {
    return new TaskfoldCliError("FORMAT_TOO_NEW", error.message);
  }
  if (error instanceof Error) {
    if (/^card not found: /.test(error.message)) {
      return new TaskfoldCliError("NOT_FOUND", error.message);
    }
    // core 的业务校验一律抛不带 code 的普通 Error（字段越界、状态约束……）；带 code 的
    // （fs 的 EACCES 等）和其他 Error 子类属于意外。
    if (error.constructor === Error && (error as NodeJS.ErrnoException).code === undefined) {
      return new TaskfoldCliError("REJECTED", error.message);
    }
    return new TaskfoldCliError("INTERNAL", error.message);
  }
  return new TaskfoldCliError("INTERNAL", String(error));
}
