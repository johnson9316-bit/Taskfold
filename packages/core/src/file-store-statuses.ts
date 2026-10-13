// Taskfold core：`.taskfold/config.yml` 里的 `statuses` 列表（需求/22-状态模型）。
//
// config.yml 还放着 `format_version` 等别的键（也可能被人手改，带注释）：这里只读写
// `statuses:` 这一段，其余内容与行尾注释原样保留。写入形状固定为带缩进的块序列，name / color
// 用 JSON 双引号字符串（它同时是合法的 YAML 双引号标量，可含冒号、中文）：
//
//   statuses:
//     - id: todo
//       name: "待办"
//       category: unstarted
//     - id: review
//       category: started
//       role: review
//
// 读取只支持这个子集（扁平映射的块序列，值为普通或引号标量），遇到别的形状抛
// {@link TaskfoldStatusConfigError}，不猜。首次写入把项目升到格式版本 4：旧版 core 不认自定义
// 状态，必须在列表出现之前就被挡进只读模式（与卡片图片升到版本 3 同一做法）。
import fs from "node:fs";
import type { TaskfoldStatusDefinition } from "./contract/index.js";
import { readFileIfExists, writeFileAtomic } from "./file-store-atomic.js";
import {
  assertTaskfoldFormatWritable,
  TASKFOLD_STATUS_MODEL_FORMAT_VERSION,
  upgradeTaskfoldFormatVersion,
} from "./file-store-format.js";
import { withTaskfoldGlobalLock } from "./file-store-locks.js";
import { TaskfoldStatusConfigError, validateStatusDefinitions } from "./status-registry.js";

const STATUSES_KEY = /^statuses:/;
/** 顶层键：不缩进、不是列表项、不是注释、不是空行。 */
const TOP_LEVEL_KEY = /^[^\s#-][^:]*:/;

function unquote(raw: string): string {
  const value = raw.trim();
  if (value.startsWith('"')) {
    // 双引号串里允许出现 " #"，所以先按 JSON 字符串的边界取完整一段，再看后面是不是注释。
    const match = /^("(?:[^"\\]|\\.)*")\s*(#.*)?$/.exec(value);
    if (match) {
      try {
        const parsed: unknown = JSON.parse(match[1]!);
        if (typeof parsed === "string") return parsed;
      } catch {
        // 落到下面的报错
      }
    }
    throw new TaskfoldStatusConfigError(`cannot parse quoted value ${value}.`);
  }
  if (value.startsWith("'")) {
    const match = /^'((?:[^']|'')*)'\s*(#.*)?$/.exec(value);
    if (match) return match[1]!.replaceAll("''", "'");
    throw new TaskfoldStatusConfigError(`cannot parse quoted value ${value}.`);
  }
  return value.replace(/\s+#.*$/, "").trim();
}

/** 找到 `statuses:` 段的行区间 `[start, end)`（`start` 是 `statuses:` 那一行）；没有返回 undefined。 */
function findStatusesBlock(lines: readonly string[]): { start: number; end: number } | undefined {
  const start = lines.findIndex((line) => STATUSES_KEY.test(line));
  if (start === -1) return undefined;
  let end = start + 1;
  while (end < lines.length && !TOP_LEVEL_KEY.test(lines[end]!)) {
    end += 1;
  }
  // 段尾的空行与注释属于下一段，不吞掉。
  while (end > start + 1 && /^\s*(#.*)?$/.test(lines[end - 1]!)) {
    end -= 1;
  }
  return { start, end };
}

function parseStatusesBlock(blockLines: readonly string[]): unknown[] {
  const items: Record<string, string>[] = [];
  for (const line of blockLines) {
    if (/^\s*(#.*)?$/.test(line)) continue;
    const item = /^\s*-\s+([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (item) {
      items.push({ [item[1]!]: unquote(item[2]!) });
      continue;
    }
    const field = /^\s+([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (field && items.length > 0) {
      items[items.length - 1]![field[1]!] = unquote(field[2]!);
      continue;
    }
    throw new TaskfoldStatusConfigError(`unsupported line in statuses: ${line.trim()}`);
  }
  return items;
}

/** 读出 `statuses`：文件或键不存在返回 undefined；有但不合法抛 {@link TaskfoldStatusConfigError}。 */
export function parseTaskfoldStatusesConfig(content: string): TaskfoldStatusDefinition[] | undefined {
  const lines = content.split(/\r?\n/);
  const block = findStatusesBlock(lines);
  if (!block) return undefined;
  const header = lines[block.start]!;
  // `statuses: []` 之类的行内写法不支持；明确报错比悄悄当成空列表好。
  if (!/^statuses:\s*(#.*)?$/.test(header)) {
    throw new TaskfoldStatusConfigError("inline values are not supported; use a block list.");
  }
  return validateStatusDefinitions(parseStatusesBlock(lines.slice(block.start + 1, block.end)));
}

function renderStatusesBlock(definitions: readonly TaskfoldStatusDefinition[]): string[] {
  const lines = ["statuses:"];
  for (const definition of definitions) {
    lines.push(`  - id: ${definition.id}`);
    if (definition.name !== undefined) lines.push(`    name: ${JSON.stringify(definition.name)}`);
    lines.push(`    category: ${definition.category}`);
    if (definition.color !== undefined) lines.push(`    color: ${JSON.stringify(definition.color)}`);
    if (definition.role !== undefined) lines.push(`    role: ${definition.role}`);
    if (definition.default) lines.push("    default: true");
  }
  return lines;
}

/** 把 `statuses` 段写进 config.yml 全文（替换或追加），其余内容不动。 */
export function renderTaskfoldStatusesConfig(
  content: string,
  definitions: readonly TaskfoldStatusDefinition[],
): string {
  const lines = content.length === 0 ? [] : content.replace(/\n$/, "").split(/\r?\n/);
  const block = findStatusesBlock(lines);
  const rendered = renderStatusesBlock(definitions);
  if (block) {
    lines.splice(block.start, block.end - block.start, ...rendered);
  } else {
    lines.push(...rendered);
  }
  return `${lines.join("\n")}\n`;
}

export type TaskfoldStatusConfigStore = {
  /** 当前项目配置的状态；没配置返回 undefined（用默认集）。config.yml 被改过会自动重读。 */
  read(): TaskfoldStatusDefinition[] | undefined;
  /** 整体替换并落盘；首次写入会把项目升到格式版本 4。 */
  write(definitions: readonly TaskfoldStatusDefinition[]): Promise<TaskfoldStatusDefinition[]>;
};

export function createTaskfoldFileStatusConfigStore(options: {
  configPath: string;
  locksDir: string;
}): TaskfoldStatusConfigStore {
  const { configPath, locksDir } = options;
  // 按 mtime+size 缓存：状态列表每次校验卡片都要用，不能每次都读盘解析。
  let cache: { stamp: string; value: TaskfoldStatusDefinition[] | undefined } | undefined;

  const stampOf = (): string => {
    try {
      const stat = fs.statSync(configPath);
      return `${stat.mtimeMs}:${stat.size}`;
    } catch {
      return "missing";
    }
  };

  return {
    read() {
      const stamp = stampOf();
      if (cache && cache.stamp === stamp) {
        return cache.value ? structuredClone(cache.value) : undefined;
      }
      const content = readFileIfExists(configPath);
      const value = content === undefined ? undefined : parseTaskfoldStatusesConfig(content);
      cache = { stamp, value };
      return value ? structuredClone(value) : undefined;
    },

    async write(definitions) {
      const validated = validateStatusDefinitions(definitions);
      assertTaskfoldFormatWritable(configPath);
      await withTaskfoldGlobalLock(locksDir, (guard) => {
        // 先升格式、再写列表：旧版 core 不认自定义状态，必须在列表出现之前就进只读模式。
        upgradeTaskfoldFormatVersion(configPath, guard.assertHeld, TASKFOLD_STATUS_MODEL_FORMAT_VERSION);
        const existing = readFileIfExists(configPath) ?? "";
        writeFileAtomic(configPath, renderTaskfoldStatusesConfig(existing, validated), undefined, guard.assertHeld);
      });
      cache = undefined;
      return validated;
    },
  };
}
