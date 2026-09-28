// Taskfold core：`.taskfold/config.yml` 的格式版本（需求/18 §3.9）。
//
// VS Code 扩展内置的 core、全局安装的 CLI、OpenClaw 插件可能是不同版本，却读写同一份
// `.taskfold/`。config.yml 记下这份数据的格式版本；core 遇到比自己新的版本就只读不写：
// 读照常，任何会改动 `.taskfold/` 的操作一律拒绝并提示升级。每次写入前都重读一次
// config.yml，所以别的进程在本进程运行期间升级了格式，本进程下一次写入就会被拦下。
//
// 只管 `.taskfold/` 本身。宿主自己目录里的东西（OpenClaw 的 projects.json、通知订阅）不归
// 这个版本号管。
import fs from "node:fs";
import { createFileExclusive, readFileIfExists, writeFileAtomic } from "./file-store-atomic.js";

/**
 * 本版 core 读写的 `.taskfold/` 格式版本。旧版 core 照旧写下去会写坏数据的改动都要 +1：
 * 目录布局，卡片 md、运行态、changes.log 的格式，以及锁参数——`file-store-locks.ts` 的
 * `TASKFOLD_LOCK_STALE_MS` / `TASKFOLD_LOCK_UPDATE_MS` 改动一次就视为一次格式升级
 * （参数不一致 proper-lockfile 检测不到，只能靠版本号把旧 core 挡在只读模式里）。
 */
export const TASKFOLD_FORMAT_VERSION = 2;

const FORMAT_VERSION_KEY = "format_version";
const FORMAT_VERSION_LINE = /^format_version:(.*)$/m;

/** config.yml 的格式版本高于本版 core（或无法识别）：本进程对这份 `.taskfold/` 只读。 */
export class TaskfoldFormatTooNewError extends Error {
  readonly code = "EFORMATTOONEW";

  constructor(configPath: string, found: string) {
    super(
      `taskfold file store: ${configPath} 的 ${FORMAT_VERSION_KEY} 是 ${found}，本版 Taskfold 只支持到 ` +
        `${TASKFOLD_FORMAT_VERSION}。为免写坏更新格式的数据，已转为只读，写入一律拒绝。` +
        "请把 Taskfold（CLI、VS Code 扩展、OpenClaw 插件）升级到支持该格式的版本。",
    );
    this.name = "TaskfoldFormatTooNewError";
  }
}

/** 读出 config.yml 里的格式版本：文件或键不存在为 `undefined`；值不是非负整数时原样返回字符串。 */
function readFormatVersion(configPath: string): number | string | undefined {
  const content = readFileIfExists(configPath);
  const match = content === undefined ? null : FORMAT_VERSION_LINE.exec(content);
  if (!match) {
    return undefined;
  }
  const raw = match[1]!.replace(/\s#.*$/, "").trim();
  const unquoted = raw.replace(/^(["'])(.*)\1$/, "$2");
  return /^\d+$/.test(unquoted) ? Number(unquoted) : raw;
}

/** 本版 core 写不了的版本（原样的字符串）；能写（含没有 config.yml、没有版本键，按当前版本处理）为 `undefined`。 */
function unsupportedFormatVersion(configPath: string): string | undefined {
  const version = readFormatVersion(configPath);
  if (version === undefined || (typeof version === "number" && version <= TASKFOLD_FORMAT_VERSION)) {
    return undefined;
  }
  return String(version);
}

/** 本版 core 能不能写这份 `.taskfold/`。 */
export function isTaskfoldFormatWritable(configPath: string): boolean {
  return unsupportedFormatVersion(configPath) === undefined;
}

/** 写入前调用：格式比本版 core 新（或无法识别）时抛 {@link TaskfoldFormatTooNewError}。 */
export function assertTaskfoldFormatWritable(configPath: string): void {
  const found = unsupportedFormatVersion(configPath);
  if (found !== undefined) {
    throw new TaskfoldFormatTooNewError(configPath, found);
  }
}

/** 初始化：config.yml 不存在就建一份，存在但没有版本键就补一行。已有版本键时不动。 */
export function ensureTaskfoldFormatVersion(configPath: string): void {
  const line = `${FORMAT_VERSION_KEY}: ${TASKFOLD_FORMAT_VERSION}\n`;
  if (createFileExclusive(configPath, line)) {
    return;
  }
  const existing = readFileIfExists(configPath) ?? "";
  if (FORMAT_VERSION_LINE.test(existing)) {
    return;
  }
  const separator = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
  fs.appendFileSync(configPath, `${separator}${line}`);
}

/** 调用方持有全局锁；在写入新格式阶段之前升级版本，保留其他配置及行尾注释。 */
export function upgradeTaskfoldFormatVersion(configPath: string, assertHeld: () => void): void {
  assertTaskfoldFormatWritable(configPath);
  if (readFormatVersion(configPath) === TASKFOLD_FORMAT_VERSION) return;
  const existing = readFileIfExists(configPath) ?? "";
  const line = `${FORMAT_VERSION_KEY}: ${TASKFOLD_FORMAT_VERSION}`;
  const content = FORMAT_VERSION_LINE.test(existing)
    ? existing.replace(FORMAT_VERSION_LINE, (match) => line + (match.match(/\s+#.*$/)?.[0] ?? ""))
    : `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}${line}\n`;
  writeFileAtomic(configPath, content, undefined, assertHeld);
}
