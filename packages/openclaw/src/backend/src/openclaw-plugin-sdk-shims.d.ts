// Local ambient module declarations for openclaw/plugin-sdk subpaths whose
// package.json `exports` condition in openclaw@2026.9.4 dropped `types`
// (only `default` remains, so `tsc` reports the module as untyped) even
// though the compiled .js implementation is unchanged and fully supported
// at runtime. Each block below declares only the members Taskfold actually
// calls, sourced by reading the compiled implementation directly. Delete the
// relevant block once upstream restores a `types` export for that subpath.

// （"openclaw/plugin-sdk/runtime-doctor" 的 shim 已随 TASK-10 第二段一起删除：.28 KV→SQLite
// doctor 迁移没有落点——数据真相源已是文件，且它依赖的 createTaskfoldSqliteStores 写路径已下线。）

// "openclaw/plugin-sdk/number-runtime": signatures confirmed against
// node_modules/openclaw/dist/number-coercion-*.mjs.
declare module "openclaw/plugin-sdk/number-runtime" {
  /** Largest timestamp accepted by JavaScript Date. */
  export const MAX_DATE_TIMESTAMP_MS: number;

  /** Checks whether a Date-valid timestamp is after the supplied/current time. */
  export function isFutureDateTimestampMs(
    value: number | undefined,
    opts?: { nowMs?: number },
  ): boolean;

  /** Resolves an absolute expiration timestamp from a positive duration in milliseconds. */
  export function resolveExpiresAtMsFromDurationMs(
    value: number | undefined,
    opts?: { nowMs?: number; bufferMs?: number; minRemainingMs?: number },
  ): number | undefined;
}

// "openclaw/plugin-sdk/global-singleton": signature confirmed against
// node_modules/openclaw/dist/plugin-sdk/memory-core-host-engine-foundation.d.ts,
// which still declares `resolveGlobalSingleton` for the identical
// global-singleton.js implementation this subpath re-exports — only this
// subpath's own `types` export was dropped.
declare module "openclaw/plugin-sdk/global-singleton" {
  type GlobalSingletonLifecycle = "close-and-restart" | "close-only" | "plugin-registry";
  type GlobalSingletonReset<T> = (value: T) => void | Promise<void>;

  /** Resolves a process-local singleton for caches and registries that tolerate helper lookup. */
  export function resolveGlobalSingleton<T>(
    key: symbol,
    create: () => T,
    reset?: GlobalSingletonReset<T>,
    lifecycle?: GlobalSingletonLifecycle,
  ): T;
}

// "openclaw/plugin-sdk/plugin-state-runtime": signature confirmed against
// node_modules/openclaw/dist/sqlite-wal-*.mjs. The returned maintenance
// handle's `close`/`checkpoint` internals depend on host WAL-scheduling
// state, so this is typed rather than reimplemented.
declare module "openclaw/plugin-sdk/plugin-state-runtime" {
  import type { DatabaseSync } from "node:sqlite";

  export function configureSqliteConnectionPragmas(
    db: DatabaseSync,
    options?: {
      busyTimeoutMs?: number;
      checkpointIntervalMs?: number;
      databaseLabel?: string;
      databasePath?: string;
      foreignKeys?: boolean;
      synchronous?: "NORMAL" | "FULL" | "OFF";
    },
  ): {
    checkpoint: (options?: unknown) => unknown;
    close: (options?: { checkpointMode?: unknown }) => boolean;
  };
}
