// Local ambient module declarations for openclaw/plugin-sdk subpaths whose
// package.json `exports` condition in openclaw@2026.9.4 dropped `types`
// (only `default` remains, so `tsc` reports the module as untyped) even
// though the compiled .js implementation is unchanged and fully supported
// at runtime. Each block below declares only the members Taskfold actually
// calls, sourced by reading the compiled implementation directly. Delete the
// relevant block once upstream restores a `types` export for that subpath.

// "openclaw/plugin-sdk/runtime-doctor": PluginDoctorStateMigration is still
// read and invoked by the host exactly as before (see
// node_modules/openclaw/dist/state-migrations.plugin-doctor-*.mjs, which
// still calls `entry.migration.detectLegacyState(...)` with this shape) and
// the host ships an equivalent first-party plugin doctor contract module
// (node_modules/openclaw/dist/extensions/*/doctor-contract-api.js) built on
// the identical { id, label, detectLegacyState, migrateLegacyState } shape
// with openPluginStateKeyedStore — only the .d.ts export was dropped.
declare module "openclaw/plugin-sdk/runtime-doctor" {
  import type { TaskfoldKeyedStore } from "@taskfold/core/persistence-types.js";

  export interface PluginDoctorStateMigrationContext {
    openPluginStateKeyedStore<T>(options: {
      namespace: string;
      maxEntries: number;
      env?: NodeJS.ProcessEnv;
    }): TaskfoldKeyedStore<T>;
  }

  export interface PluginDoctorStateMigration {
    id: string;
    label: string;
    detectLegacyState(params: {
      context: PluginDoctorStateMigrationContext;
      env: NodeJS.ProcessEnv;
      stateDir: string;
    }): Promise<{ preview: string[] } | null>;
    migrateLegacyState(params: {
      context: PluginDoctorStateMigrationContext;
      env: NodeJS.ProcessEnv;
      stateDir: string;
    }): Promise<{ changes: string[]; warnings: string[] }>;
  }
}

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
