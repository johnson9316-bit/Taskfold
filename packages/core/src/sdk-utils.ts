// 从 openclaw/plugin-sdk 借用的纯工具函数的本地实现，让 core 不依赖 openclaw。
// 每个函数都按 openclaw@2026.9.4 编译产物（node_modules/openclaw/dist/*.mjs）逐行对照移植，
// 只保留 Taskfold 实际用到的参数；行为必须与上游保持一致，改动前先对照上游源码。
import { timingSafeEqual } from "node:crypto";

/** 对应 number-runtime 的 MAX_DATE_TIMESTAMP_MS：JavaScript Date 能表示的最大时间戳。 */
export const MAX_DATE_TIMESTAMP_MS = 864e13;

function asFiniteNumber(value: unknown): number | undefined {
  return Number.isFinite(value) ? (value as number) : undefined;
}

function asDateTimestampMs(value: unknown): number | undefined {
  const number = asFiniteNumber(value);
  if (number === undefined || number < -MAX_DATE_TIMESTAMP_MS || number > MAX_DATE_TIMESTAMP_MS) {
    return undefined;
  }
  return number;
}

function asPositiveSafeInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : undefined;
}

function isDateRepresentable(value: number): boolean {
  return asDateTimestampMs(value) !== undefined;
}

/** 对应 number-runtime 的 isFutureDateTimestampMs：时间戳合法且晚于 nowMs（缺省为当前时间）。 */
export function isFutureDateTimestampMs(
  value: number | undefined,
  opts: { nowMs?: number } = {},
): boolean {
  const timestampMs = asDateTimestampMs(value);
  const nowMs = asDateTimestampMs(opts.nowMs ?? Date.now());
  return timestampMs !== undefined && nowMs !== undefined && timestampMs > nowMs;
}

/** 对应 number-runtime 的 resolveExpiresAtMsFromDurationMs：由正整数时长推出绝对过期时间戳。 */
export function resolveExpiresAtMsFromDurationMs(
  value: number | undefined,
  opts: { nowMs?: number; bufferMs?: number; minRemainingMs?: number } = {},
): number | undefined {
  const durationMs = asPositiveSafeInteger(value);
  if (durationMs === undefined) {
    return undefined;
  }
  const nowMs = asDateTimestampMs(opts.nowMs ?? Date.now());
  const bufferMs = asFiniteNumber(opts.bufferMs ?? 0);
  if (nowMs === undefined || bufferMs === undefined) {
    return undefined;
  }
  const expiresAt = nowMs + durationMs - bufferMs;
  if (!Number.isSafeInteger(expiresAt) || !isDateRepresentable(expiresAt)) {
    return undefined;
  }
  const minRemainingMs = opts.minRemainingMs;
  if (minRemainingMs === undefined) {
    return expiresAt;
  }
  const minExpiresAt = nowMs + minRemainingMs;
  if (!Number.isSafeInteger(minExpiresAt) || !isDateRepresentable(minExpiresAt)) {
    return expiresAt;
  }
  return Math.max(expiresAt, minExpiresAt);
}

function padSecretBytes(bytes: Buffer, length: number): Buffer {
  if (bytes.length === length) {
    return bytes;
  }
  const padded = Buffer.alloc(length);
  bytes.copy(padded);
  return padded;
}

/**
 * 对应 security-runtime 的 safeEqualSecret：常数时间比较两个可选的 UTF-8 秘密串。
 * 先补齐到相同长度再走 timingSafeEqual，避免长度不同时抛错而泄露长度信息。
 */
export function safeEqualSecret(provided: unknown, expected: unknown): boolean {
  if (typeof provided !== "string" || typeof expected !== "string") {
    return false;
  }
  const providedBytes = Buffer.from(provided, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  const byteLength = Math.max(providedBytes.length, expectedBytes.length);
  if (byteLength === 0) {
    return true;
  }
  return (
    timingSafeEqual(
      padSecretBytes(providedBytes, byteLength),
      padSecretBytes(expectedBytes, byteLength),
    ) && providedBytes.length === expectedBytes.length
  );
}

/** 对应 string-coerce-runtime 的 isRecord：非数组的对象。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isHighSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function isLowSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}

function sliceUtf16Safe(input: string, start: number, end?: number): string {
  const len = input.length;
  let from = start < 0 ? Math.max(len + start, 0) : Math.min(start, len);
  let to = end === undefined ? len : end < 0 ? Math.max(len + end, 0) : Math.min(end, len);
  if (to <= from) {
    return "";
  }
  if (from > 0 && from < len) {
    if (isLowSurrogate(input.charCodeAt(from)) && isHighSurrogate(input.charCodeAt(from - 1))) {
      from += 1;
    }
  }
  if (to > 0 && to < len) {
    if (isHighSurrogate(input.charCodeAt(to - 1)) && isLowSurrogate(input.charCodeAt(to))) {
      to -= 1;
    }
  }
  return input.slice(from, to);
}

/** 对应 string-coerce-runtime 的 truncateUtf16Safe：截断时不切开代理对。 */
export function truncateUtf16Safe(input: string, maxLen: number): string {
  const limit = Math.max(0, Math.floor(maxLen));
  if (input.length <= limit) {
    return input;
  }
  return sliceUtf16Safe(input, 0, limit);
}

/**
 * 对应 global-singleton 的 resolveGlobalSingleton（仅两参形式，Taskfold 不用 reset）：
 * 以 symbol 为键在 globalThis 上取进程级单例，不存在时创建并挂上。
 */
export function resolveGlobalSingleton<T>(key: symbol, create: () => T): T {
  const globalStore = globalThis as Record<symbol, unknown>;
  if (Object.hasOwn(globalStore, key)) {
    return globalStore[key] as T;
  }
  const value = create();
  globalStore[key] = value;
  return value;
}
