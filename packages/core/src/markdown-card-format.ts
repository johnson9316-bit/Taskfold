// Taskfold 文件存储改造 · 第 1 期格式层。
//
// 范围边界（严格）：本文件只做「字符串/对象 <-> 字符串/对象」的纯函数转换，不碰文件系统、
// 不分配卡片 ID、不解析目录布局。调用方（未来的存储后端层）负责：
//   - 决定 .md 文件放在哪个目录；
//   - 分配 <prefix>-<N> 形式的展示 ID（本模块只序列化/反序列化它，不生成它）；
//   - 把一张「纯 backlog 创建、Taskfold 从未写过」的卡片收编成 Taskfold 卡片（首次分配
//     UUID/revision 并写入 TASKFOLD 区块）——本模块的 parseMarkdownCard() 假定文件至少
//     已经被 Taskfold 写过一次（存在 <!-- SECTION:TASKFOLD:BEGIN/END --> 区块），缺失时直接
//     抛错，不做静默收编。
//
// 依据的三份规格（均在会话 scratchpad 里，路径见任务说明）：
//   - Backlog.md v1.52.0 格式契约（源码精读 + 实跑验证）
//   - 新后端硬性语义规格 R6/R7
//   - 需求/16-文件存储改造.md §6.1~6.4
//
// ============================================================================
// 设计决策（与规划文档不一致的地方，均在此集中说明，避免散落在函数注释里反复重复）
// ============================================================================
//
// 决策 1：TASKFOLD 区块内部改用 JSON，不用需求文档示例里的 YAML flow 语法。
//   理由：TASKFOLD 区块对 backlog 而言是纯"外族哨兵"内容，backlog 从不解析其内部格式，
//   我们对内部格式有完全自由。JSON.stringify/JSON.parse 对"键缺失 -> 省略"
//   "null -> 保留""空数组 -> 保留""嵌套空对象 -> 保留"是语言内建行为，天然满足新后端硬性
//   语义规格 R6（round-trip 精确性），且不需要像 sqlite-store.ts 的 9 个 read* 函数那样
//   为每个字段手写"该不该出现"的判断——因为根本没有"拆成扁平行再重建"这一步，那类 bug
//   的滋生土壤不存在。frontmatter 仍是给真实 backlog CLI 消费的、名副其实的 YAML 文本。
//
// 决策 2：不引入 js-yaml 依赖。
//   仓库当前未装 js-yaml/yaml（node_modules 里没有），新增依赖要改 package.json 并重新
//   安装，超出"只新增文件、不改现有源文件"的授权范围。frontmatter 需要写出真实 YAML
//   （backlog 自己会用 js-yaml 解析），于是本文件手写了一个够用的 YAML 子集编解码器
//   （标量 + 块序列 + 空数组内联），并用仓库里 Backlog.md checkout 自带的
//   node_modules/js-yaml@3.15.0（backlog 实际依赖的版本）跑脚本实测校验了下面这些规则：
//     - gray-matter 用的是 yaml.safeLoad / yaml.safeDump（SAFE_SCHEMA），不是完整 YAML 1.1。
//     - bool 解析只认 true/True/TRUE/false/False/FALSE；yes/no/on/off/y/n 读回来仍是字符串
//       ——这与"新后端硬性语义规格"里"yes/no/on/off 会变 boolean"的说法不一致，已用实跑
//       验证纠正（见下方"YAML 1.1 陷阱"小节）。但 js-yaml 的 dumper 会**防御性地**把
//       y/Y/yes/Yes/YES/n/N/no/No/NO/on/On/ON/off/Off/OFF 这些"废弃 bool 写法"整体单引号
//       包裹（dumper.ts 的 DEPRECATED_BOOLEANS_SYNTAX），即便当前 schema 的 loader 不会
//       把它们读成 boolean——这是为了防未来/其它工具用更宽的 schema 读这份文件时改变语义。
//       本模块的写入侧照抄这条防御性规则。
//     - "1.0" 之类的数字形态字符串会被读成 number；未加引号的日期/日期时间会被读成 Date。
//       这两条规划文档说对了，已用实跑复核。
//   本子集只覆盖 frontmatter 21 个白名单键实际会用到的形态（字符串 / 字符串数组 / 整数），
//   不追求覆盖完整 YAML 1.1 文法（八进制/十六进制整数、折叠块标量等未实现，纯字符串
//   字段一律用"看起来像不像会被误判"的规则决定是否加引号，宁可多加引号也不少加）。
//
// 决策 3：不产生 TASKFOLD 区块里的顶层 boardId 副本。
//   需求/16 §6.1 的示例在 TASKFOLD 区块顶层写了一份 `boardId`，但 boardId 本来就在
//   card.metadata.automation.boardId 里（14 个 Taskfold 独有字段之一 `metadata` 已经带着
//   它），JSON 整体序列化下没有必要再复制一份。sqlite-store.ts 的 `board_id` 派生列是给
//   SQL 查询用的性能优化，属于目录路由/存储后端层的关注点（本次目录布局还未定案），不属于
//   格式层，跳过。
//
// 决策 4：position 的完整精度额外存进 TASKFOLD 区块（这是任务里明确要求的,不是我自己加的）。
//   card.position 本是"两边重叠字段"（对应 frontmatter 的 ordinal），但 ordinal 是整数、
//   position 是 REAL（如 1024.5，用于拖拽排序），四舍五入取整会丢精度。因此序列化时
//   ordinal = Math.round(position) 只作为给 backlog 看的整数投影，TASKFOLD 区块里额外存
//   一份完整的 position 值作为权威来源；反序列化时优先读 TASKFOLD 区块里的 position，
//   只有该区块缺失（文件从未被 Taskfold 写过，理论上不会走到这条路径，见范围边界）才回退
//   用 ordinal。
//
// 决策 5：改标题不重命名文件。
//   需求/16 第七节写"改标题时重命名文件（抄 Backlog.md）"，但格式契约文档核实过
//   Backlog.md 源码后确认：backlog 对 task **不会**重命名文件（只有 draft/decision 才会），
//   `filePath` 存在时直接保留旧文件名。本模块的文件名相关函数（buildCardFilename /
//   parseCardFilename）只负责生成/解析文件名字符串，调用方不应在"改标题"场景调用
//   buildCardFilename 重新生成文件名——这一点无法在纯函数签名层面强制,只能在此说明。
//
// 决策 6：assignee 数组只保留首元素对应到 agentId。
//   agentId 是单值,assignee 是数组,若文件被外部写入者(backlog CLI/人手)写入了多个
//   assignee,反序列化只取第一个,重新序列化时会坍缩成单元素数组——这是 Taskfold 数据模型
//   本身的限制（agentId 只能有一个），不是本模块的 bug。
//
// 决策 7：status/priority 不校验值域，照抄 sqlite-store.ts 的 readCard 做法。
//   frontmatter 的 status 可能是 config.yml 里配置的自定义值，这里直接 cast，不检查是否属于
//   TASKFOLD_STATUSES 九个值之一。priority 在 backlog 白名单里是可选键，Taskfold 的
//   TaskfoldCard.priority 是必填字段，缺失时默认回退成 "normal" 并在代码里注明。

import type {
  TaskfoldCard,
  TaskfoldCardKind,
  TaskfoldDelivery,
  TaskfoldEvent,
  TaskfoldExecution,
  TaskfoldMetadata,
  TaskfoldPriority,
  TaskfoldSourceReference,
  TaskfoldStatus,
} from "./contract/index.js";
import { TASKFOLD_PRIORITIES } from "./contract/index.js";

// ============================================================================
// 0. 通用行取值 helper —— 复用 sqlite-store.ts 里 9 个纯值 helper 的签名与语义
//    （签名 (row, key)；frontmatter 解析结果同样是 Record<string, unknown> 形状）。
//    因为 sqlite-store.ts 里这些函数没有 export，无法直接 import（不允许改现有文件加
//    export），这里按同样的规则重新实现，行为逐条对齐：
//      - stringValue：空字符串当 undefined
//      - numberValue：接受 bigint
//      - requiredString/requiredNumber：缺失时抛错
//      - optional：空对象当 undefined
// ============================================================================

// 以下几个 (row, key) 取值 helper 与 frontmatter 块级编解码函数原本是本文件的私有实现
// 细节，但 markdown-milestone-format.ts（任务 2，里程碑的同一套格式层）需要原样复用
// 它们，而不是重新抄一遍——这里加 export 只是放开可见性，行为一字不改。
export type Row = Record<string, unknown>;

export function stringValue(row: Row, key: string): string | undefined {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function numberValue(row: Row, key: string): number | undefined {
  const value = row[key];
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  return undefined;
}

export function requiredString(row: Row, key: string): string {
  const value = stringValue(row, key);
  if (!value) {
    throw new Error(`markdown-card-format: 缺少必填字段 "${key}"`);
  }
  return value;
}

function requiredNumber(row: Row, key: string): number {
  const value = numberValue(row, key);
  if (value === undefined) {
    throw new Error(`markdown-card-format: 缺少必填字段 "${key}"`);
  }
  return value;
}

function optional<T extends object>(value: T): T | undefined {
  return Object.keys(value).length > 0 ? value : undefined;
}

/** 非数组一律变成 []（照抄格式契约"非数组 -> 变成 []，标量值被静默吞掉"）。 */
function arrayOfStrings(row: Row, key: string): string[] {
  const value = row[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

// ============================================================================
// 1. 迷你 YAML 标量编解码器（frontmatter 专用子集，见文件头决策 2）
// ============================================================================

export type YamlScalar = string | number | boolean | null;

const YAML_NULL_PATTERN = /^(~|null|Null|NULL)$/;
const YAML_BOOL_TRUE_PATTERN = /^(true|True|TRUE)$/;
const YAML_BOOL_FALSE_PATTERN = /^(false|False|FALSE)$/;
// 简化子集：十进制整数（含下划线分隔），不覆盖 0x/0o/0b 与八进制前导零形态。
const YAML_INT_PATTERN = /^[-+]?(0|[1-9][0-9_]*)$/;
// 简化子集：十进制小数/科学计数法，覆盖 "1.0" 这类任务要求的陷阱。
const YAML_FLOAT_PATTERN =
  /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]+(?:[eE][-+]?[0-9]+)?$|^[-+]?[0-9][0-9_]*[eE][-+]?[0-9]+$/;
const YAML_TIMESTAMP_DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const YAML_TIMESTAMP_DATETIME_PATTERN =
  /^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}[Tt ][0-9]{1,2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]*)?([ \t]*(Z|[-+][0-9]{1,2}(?::[0-9]{2})?))?$/;
/**
 * 以下几条只用于写入侧的"会不会被误判"判定（`isAmbiguousYamlScalar`），不用于
 * `parseYamlScalar` 读取侧——我们自己写出来的这类值一律带引号，读取侧不需要真的
 * 去解析 0x/0o/0b 数值。已用 node_modules/js-yaml@3.15.0（Backlog.md v1.52.0 实际
 * 依赖版本）实测校验，籤字与真实 resolveYamlInteger/resolveYamlFloat 的判定逐条核对：
 *
 * - 十六进制/二进制只有**小写** `0x`/`0b` 前缀会被真实 resolver 识别（`int.js` 里
 *   `ch === 'x'`/`ch === 'b'` 是大小写敏感的字符比较），大写 `0X`/`0B` 前缀不会被
 *   误判——已实测确认（`safeDump({a:"0X1f"})` 不加引号，`safeDump({a:"0B1011"})`
 *   同样不加引号），因此这里刻意不覆盖大写前缀，避免生成的引号在 golden 对照测试里
 *   跟真实 js-yaml 的输出不一致。
 * - `0o17`/`0O17` 这种"0o 前缀八进制"是 YAML 1.2 的写法，js-yaml 3.15.0 的
 *   `resolveYamlInteger` 完全不认（第二个字符不是 'b'/'x' 时会直接落到裸八进制数字
 *   循环，'o'/'O' 不是合法八进制数字，直接判定失败）——已实测确认两种大小写都不加
 *   引号，因此这里也不覆盖，理由同上：这不是真实的歧义，加了反而会让 golden 测试
 *   断言一个假结果。
 * - 真正会被误判成八进制的是**裸前导零**形态（如 "010" "0755"），已实测确认。
 * - `.inf`/`.Inf`/`.INF`（可选正负号）与 `.nan`/`.NaN`/`.NAN`（无符号）是
 *   `float.js` 精确列出的三种大小写，逐一实测确认都会被加引号。
 * - 60 进制（sexagesimal，如 "1:30"）理论上会被 int/float 的 resolve 命中，但实践中
 *   这个模式**必然含冒号**，已经被下面 `isPlainSafeChar` 的冒号排除规则捕获（任何
 *   含冒号的标量都进不了 plain 分支），所以这条规则在当前实现里是冗余防御——保留
 *   显式正则只是为了防止将来有人收紧/重写冒号排除逻辑时,不知不觉把这个隐藏依赖也
 *   删掉。已用 golden 测试锁定这个结论（对照真实 js-yaml 的实际输出）。
 */
const YAML_HEX_PATTERN = /^[-+]?0x[0-9a-fA-F_]+$/;
const YAML_BINARY_PATTERN = /^[-+]?0b[01_]+$/;
const YAML_LEADING_ZERO_OCTAL_PATTERN = /^[-+]?0[0-7_]+$/;
const YAML_INF_PATTERN = /^[-+]?\.(inf|Inf|INF)$/;
const YAML_NAN_PATTERN = /^\.(nan|NaN|NAN)$/;
const YAML_SEXAGESIMAL_PATTERN = /^[-+]?[0-9][0-9_]*(:[0-5]?[0-9])+(\.[0-9_]*)?$/;
/**
 * js-yaml 的 dumper（DEPRECATED_BOOLEANS_SYNTAX）会防御性地给这些"废弃 bool 写法"加引号，
 * 即便当前 SAFE_SCHEMA 的 loader 并不会把它们读成 boolean（已用 node_modules/js-yaml@3.15.0
 * 实跑验证：safeLoad("a: yes") 得到字符串 "yes"，不是 true）。写入侧照抄这条防御规则，
 * 读取侧则按真实 loader 行为处理——不把它们当 boolean。
 */
const YAML_DEPRECATED_BOOLEAN_WORDS = new Set([
  "y",
  "Y",
  "yes",
  "Yes",
  "YES",
  "n",
  "N",
  "no",
  "No",
  "NO",
  "on",
  "On",
  "ON",
  "off",
  "Off",
  "OFF",
]);

function unescapeDoubleQuotedYaml(text: string): string {
  return text.replace(/\\(.)/g, (_match, ch: string) => {
    switch (ch) {
      case "n":
        return "\n";
      case "t":
        return "\t";
      case "r":
        return "\r";
      case "0":
        return "\0";
      case "\\":
        return "\\";
      case '"':
        return '"';
      default:
        return ch;
    }
  });
}

/** 解析一个 frontmatter 标量（不含首尾 key、冒号）。对齐 js-yaml safeLoad 的解析结果。 */
export function parseYamlScalar(raw: string): YamlScalar {
  const text = raw.trim();
  if (text.length >= 2 && text[0] === "'" && text[text.length - 1] === "'") {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  if (text.length >= 2 && text[0] === '"' && text[text.length - 1] === '"') {
    return unescapeDoubleQuotedYaml(text.slice(1, -1));
  }
  if (text === "") {
    return "";
  }
  if (YAML_NULL_PATTERN.test(text)) {
    return null;
  }
  if (YAML_BOOL_TRUE_PATTERN.test(text)) {
    return true;
  }
  if (YAML_BOOL_FALSE_PATTERN.test(text)) {
    return false;
  }
  if (YAML_INT_PATTERN.test(text)) {
    return Number(text.replace(/_/g, ""));
  }
  if (YAML_FLOAT_PATTERN.test(text)) {
    return Number(text.replace(/_/g, ""));
  }
  if (YAML_TIMESTAMP_DATE_PATTERN.test(text) || YAML_TIMESTAMP_DATETIME_PATTERN.test(text)) {
    // 未加引号的日期/日期时间会被真实 js-yaml 读成 Date；我们把它规范化成字符串原样保留
    // （已知字段全部是字符串类型），并依赖写入侧一律给这类值加引号来避免再次踩雷。
    return text;
  }
  return text;
}

function isPlainSafeFirstChar(ch: string): boolean {
  if (ch === " " || ch === "\t") {
    return false;
  }
  return !"-?:,[]{}#&*!|=>'\"%@`".includes(ch);
}

function isPlainSafeChar(ch: string, prev: string | undefined): boolean {
  if (",[]{}:".includes(ch)) {
    return false;
  }
  if (ch === "#") {
    return prev !== undefined && prev !== " " && prev !== "\t";
  }
  return true;
}

/** 照抄 js-yaml dumper 的 isPlainSafeFirst/isPlainSafe 简化判定（见文件头决策 2）。 */
function isPlainYamlScalar(text: string): boolean {
  if (text.length === 0 || text.includes("\n")) {
    return false;
  }
  const firstChar = text[0] ?? "";
  const lastChar = text[text.length - 1] ?? "";
  if (!isPlainSafeFirstChar(firstChar) || lastChar === " " || lastChar === "\t") {
    return false;
  }
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? "";
    const prev = i > 0 ? text[i - 1] : undefined;
    if (!isPlainSafeChar(ch, prev)) {
      return false;
    }
  }
  return true;
}

/**
 * 写入侧专用的"会不会被真实 js-yaml 误判成别的类型"判定。只在 `stringifyYamlScalar`
 * 里使用，`parseYamlScalar`（读取侧）不用它——读取侧只需要正确处理"我们自己写出来的
 * 一定带引号"这个不变量，不需要真的去解析 0x/0o/0b/60 进制数值（见上面几条 PATTERN
 * 常量的注释，含大小写覆盖范围的实测依据）。
 */
function isAmbiguousYamlScalar(text: string): boolean {
  return (
    YAML_NULL_PATTERN.test(text) ||
    YAML_BOOL_TRUE_PATTERN.test(text) ||
    YAML_BOOL_FALSE_PATTERN.test(text) ||
    YAML_INT_PATTERN.test(text) ||
    YAML_FLOAT_PATTERN.test(text) ||
    YAML_TIMESTAMP_DATE_PATTERN.test(text) ||
    YAML_TIMESTAMP_DATETIME_PATTERN.test(text) ||
    YAML_DEPRECATED_BOOLEAN_WORDS.has(text) ||
    YAML_HEX_PATTERN.test(text) ||
    YAML_BINARY_PATTERN.test(text) ||
    YAML_LEADING_ZERO_OCTAL_PATTERN.test(text) ||
    YAML_INF_PATTERN.test(text) ||
    YAML_NAN_PATTERN.test(text) ||
    YAML_SEXAGESIMAL_PATTERN.test(text)
  );
}

function quoteYamlScalar(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}

/** 字符串标量按需加单引号；数字直接输出十进制文本，两者都不会输出多行。 */
export function stringifyYamlScalar(value: string | number): string {
  if (typeof value === "number") {
    return String(value);
  }
  const normalized = value.replace(/\n/g, " "); // frontmatter 标量不支持内嵌换行，见文件头决策 2
  if (!isPlainYamlScalar(normalized) || isAmbiguousYamlScalar(normalized)) {
    return quoteYamlScalar(normalized);
  }
  return normalized;
}

// ============================================================================
// 2. frontmatter 块级编解码（21 个白名单键，块序列缩进 2 空格，空数组内联 []）
// ============================================================================

export type FrontmatterFieldValue = string | number | string[] | undefined;

export function stringifyFrontmatterBlock(entries: ReadonlyArray<readonly [string, FrontmatterFieldValue]>): string {
  const lines: string[] = [];
  for (const [key, value] of entries) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${stringifyYamlScalar(item)}`);
        }
      }
      continue;
    }
    lines.push(`${key}: ${stringifyYamlScalar(value)}`);
  }
  return lines.join("\n");
}

const FRONTMATTER_KEY_LINE_PATTERN = /^([A-Za-z_][A-Za-z0-9_]*):[ \t]?(.*)$/;
const FRONTMATTER_LIST_ITEM_PATTERN = /^ {2}- (.*)$/;

export function parseFrontmatterBlock(text: string): Row {
  const lines = text.split("\n");
  const result: Row = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    const match = FRONTMATTER_KEY_LINE_PATTERN.exec(line);
    if (!match) {
      // 无法识别的行：防御性跳过，不让整份 frontmatter 因为一行意外格式而报废。
      i += 1;
      continue;
    }
    const key = match[1] ?? "";
    const rest = (match[2] ?? "").trim();
    if (rest === "[]") {
      result[key] = [];
      i += 1;
      continue;
    }
    if (rest !== "") {
      result[key] = parseYamlScalar(rest);
      i += 1;
      continue;
    }
    // 空 rest：期待紧随的块序列（2 空格缩进 "- item"）。
    const items: YamlScalar[] = [];
    let j = i + 1;
    while (j < lines.length) {
      const itemMatch = FRONTMATTER_LIST_ITEM_PATTERN.exec(lines[j] ?? "");
      if (!itemMatch) {
        break;
      }
      items.push(parseYamlScalar(itemMatch[1] ?? ""));
      j += 1;
    }
    result[key] = items;
    i = j;
  }
  return result;
}

export function splitFrontmatter(markdown: string): { frontmatter: string; body: string } {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (lines[0] !== "---") {
    throw new Error("markdown-card-format: 文件必须以 --- 开头的 frontmatter 分隔符起始");
  }
  let closeIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === "---") {
      closeIndex = i;
      break;
    }
  }
  if (closeIndex === -1) {
    throw new Error("markdown-card-format: frontmatter 未正确以 --- 闭合");
  }
  const frontmatter = lines.slice(1, closeIndex).join("\n");
  const body = lines
    .slice(closeIndex + 1)
    .join("\n")
    .replace(/^\n+/, "");
  return { frontmatter, body };
}

// ============================================================================
// 3. backlog 日期格式 <-> epoch 毫秒
//    实际写入格式：new Date().toISOString().slice(0,16).replace("T"," ")
//    即 "YYYY-MM-DD HH:mm"，UTC，无秒无时区（格式契约"日期"一节）。
// ============================================================================

const BACKLOG_DATETIME_PATTERN = /^([0-9]{4})-([0-9]{2})-([0-9]{2}) ([0-9]{2}):([0-9]{2})$/;

export function formatBacklogDateTime(epochMs: number): string {
  const date = new Date(epochMs);
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
  );
}

/**
 * TASKFOLD 区块里的毫秒时间戳与 frontmatter 的分钟值（Backlog 的 created_date）二选一：毫秒值
 * 截到分钟后与分钟值相同才用它，否则说明 frontmatter 被人手改过，以分钟值为准；区块里没有
 * 毫秒值（旧文件）同样回退到分钟值。
 */
export function resolvePreciseTimestamp(payloadValue: unknown, backlogMinuteValue: number): number {
  if (typeof payloadValue !== "number" || !Number.isFinite(payloadValue)) {
    return backlogMinuteValue;
  }
  return Math.floor(payloadValue / 60_000) * 60_000 === backlogMinuteValue ? payloadValue : backlogMinuteValue;
}

export function parseBacklogDateTime(text: string): number {
  const match = BACKLOG_DATETIME_PATTERN.exec(text.trim());
  if (!match) {
    throw new Error(`markdown-card-format: 无法解析日期 "${text}"，backlog 存储格式须为 "YYYY-MM-DD HH:mm"`);
  }
  const [, year, month, day, hour, minute] = match as unknown as [string, string, string, string, string, string];
  return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0);
}

// ============================================================================
// 4. 哨兵区块查找（严格按格式契约"哨兵匹配的精确规则"一节）
// ============================================================================

export type SentinelBlockLocation = {
  headingLineIndex: number;
  beginLineIndex: number;
  endLineIndex: number;
};

/**
 * SECTION 家族（如 SECTION:DESCRIPTION、SECTION:TASKFOLD）：整行匹配、无前导空白、
 * 允许尾随空白、大小写敏感（heading 除外）、同族 BEGIN 做深度计数。逐字端口自
 * Backlog.md 的 findSentinelBlocks()。
 */
export function findSectionFamilyBlock(
  lines: readonly string[],
  headingTitle: string,
  markerId: string,
): SentinelBlockLocation | undefined {
  const heading = `## ${headingTitle}`.toLowerCase();
  const begin = `<!-- SECTION:${markerId}:BEGIN -->`;
  const end = `<!-- SECTION:${markerId}:END -->`;
  for (let index = 0; index < lines.length; index += 1) {
    if ((lines[index] ?? "").trimEnd().toLowerCase() !== heading) {
      continue;
    }
    let beginIndex = index + 1;
    while (beginIndex < lines.length && (lines[beginIndex] ?? "").trim() === "") {
      beginIndex += 1;
    }
    if ((lines[beginIndex] ?? "").trimEnd() !== begin) {
      continue;
    }
    let depth = 1;
    let endIndex = beginIndex + 1;
    while (endIndex < lines.length) {
      const candidate = (lines[endIndex] ?? "").trimEnd();
      if (candidate === begin) {
        depth += 1;
      } else if (candidate === end) {
        depth -= 1;
        if (depth === 0) {
          break;
        }
      }
      endIndex += 1;
    }
    if (depth !== 0) {
      continue;
    }
    return { headingLineIndex: index, beginLineIndex: beginIndex, endLineIndex: endIndex };
  }
  return undefined;
}

/**
 * AC/DoD 风格的扁平标记（`<!-- AC:BEGIN -->` 不带 SECTION 前缀）：不做深度计数，
 * 取第一个 BEGIN 之后第一个匹配的 END。Taskfold 只保留这两段的原始文本、不解析清单
 * 语义，因此不复刻 backlog"重复 BEGIN 判 ambiguous"的报错行为——真实 backlog 写出的
 * 文件不会出现同族嵌套，只有故意构造的畸形文件才会有差异，这里选择简化。
 */
export function findFlatMarkerBlock(
  lines: readonly string[],
  headingTitle: string,
  markerId: string,
): SentinelBlockLocation | undefined {
  const heading = `## ${headingTitle}`.toLowerCase();
  const begin = `<!-- ${markerId}:BEGIN -->`;
  const end = `<!-- ${markerId}:END -->`;
  for (let index = 0; index < lines.length; index += 1) {
    if ((lines[index] ?? "").trimEnd().toLowerCase() !== heading) {
      continue;
    }
    let beginIndex = index + 1;
    while (beginIndex < lines.length && (lines[beginIndex] ?? "").trim() === "") {
      beginIndex += 1;
    }
    if ((lines[beginIndex] ?? "").trimEnd() !== begin) {
      continue;
    }
    let endIndex = beginIndex + 1;
    while (endIndex < lines.length && (lines[endIndex] ?? "").trimEnd() !== end) {
      endIndex += 1;
    }
    if (endIndex >= lines.length) {
      continue;
    }
    return { headingLineIndex: index, beginLineIndex: beginIndex, endLineIndex: endIndex };
  }
  return undefined;
}

export function buildSentinelSectionBlock(title: string, markerId: string, body: string): string {
  const begin = `<!-- SECTION:${markerId}:BEGIN -->`;
  const end = `<!-- SECTION:${markerId}:END -->`;
  const normalizedBody = body.replace(/[ \t]+$/gm, "").replace(/\s+$/, "");
  const content = normalizedBody ? `${normalizedBody}\n` : "";
  return `## ${title}\n\n${begin}\n${content}${end}`;
}

function buildFlatMarkerBlockText(title: string, markerId: string, body: string): string {
  const begin = `<!-- ${markerId}:BEGIN -->`;
  const end = `<!-- ${markerId}:END -->`;
  const normalizedBody = body.replace(/\s+$/, "");
  if (!normalizedBody) {
    return "";
  }
  return [`## ${title}`, begin, ...normalizedBody.split("\n"), end].join("\n");
}

// ============================================================================
// 5. 写入自检：转义任意会被 backlog 误判成哨兵/已知标题的行（P0 雷 #5/#6 的防线）
// ============================================================================

/**
 * 通配哨兵行：SECTION 家族名是通配的（[A-Z][A-Z0-9_]*），因此这条规则会命中我们自己
 * 合法的 `<!-- SECTION:TASKFOLD:BEGIN/END -->`。这不是问题：本函数只应在"把这段文本
 * 塞进某个区块正文之前"调用，从未应用于我们自己生成的包装行本身（包装行是序列化时另外
 * 拼接的，不经过这个函数）。
 */
const GENERIC_SENTINEL_LINE_PATTERN =
  /^<!-- (SECTION:[A-Z][A-Z0-9_]*|COMMENTS|COMMENT|AC|DOD):(BEGIN|END) -->[\t ]*$/;

const KNOWN_HEADING_LINE_PATTERN =
  /^## (Description|Acceptance Criteria|Acceptance Criteria \(Optional\)|Definition of Done|Implementation Plan|Implementation Plan \(Optional\)|Implementation Notes|Implementation Notes \(Optional\)|Notes|Notes & Comments \(Optional\)|Comments|Final Summary)\s*$/i;

/**
 * 对 Taskfold 写入的任意自由文本逐行转义：命中"哨兵行"或"已知 ## 标题"的整行，
 * 行首加一个空格（backlog 自己报错信息里建议的转义办法）。代码围栏不提供保护，
 * 因此本函数逐行扫描，不做 fence 感知（对齐格式契约 P0 雷 #6 的结论）。
 */
export function escapeTaskfoldBodyText(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.replace(/[ \t]+$/, "");
      if (GENERIC_SENTINEL_LINE_PATTERN.test(trimmed) || KNOWN_HEADING_LINE_PATTERN.test(trimmed)) {
        return ` ${line}`;
      }
      return line;
    })
    .join("\n");
}

// ============================================================================
// 6. 文件名 / 展示 ID
// ============================================================================

/** 逐字照抄 Backlog.md 的 sanitizeFilename 算法（operations.ts）。 */
export function sanitizeCardFilenameTitle(title: string): string {
  const sanitized = title
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/['(),!@#$%^&+=[\]{};]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return sanitized || "untitled";
}

export type CardDisplayId = {
  /** 大写 prefix，如 "CARD"。frontmatter 里的规范形式。 */
  prefix: string;
  numericId: number;
};

/** frontmatter 里的 id 形态：大写 prefix + 数字，如 "CARD-42"。 */
export function formatCardFrontmatterId(displayId: CardDisplayId): string {
  return `${displayId.prefix.toUpperCase()}-${displayId.numericId}`;
}

const FRONTMATTER_ID_PATTERN = /^([A-Za-z]+)-([0-9]+)$/;

export function parseCardFrontmatterId(id: string): CardDisplayId | undefined {
  const match = FRONTMATTER_ID_PATTERN.exec(id.trim());
  if (!match) {
    return undefined;
  }
  return { prefix: (match[1] ?? "").toUpperCase(), numericId: Number(match[2]) };
}

/**
 * 文件名形态：小写 prefix + 数字 + " - " + sanitize 后的标题 + ".md"。
 * ⚠️ 改标题时不应该用这个函数重新生成文件名再覆盖旧文件——backlog 对 task 不重命名
 * 文件，Taskfold 跟随（见文件头决策 5）。本函数只管字符串拼接，不管调用时机。
 */
export function buildCardFilename(displayId: CardDisplayId, title: string): string {
  return `${displayId.prefix.toLowerCase()}-${displayId.numericId} - ${sanitizeCardFilenameTitle(title)}.md`;
}

export type ParsedCardFilename = {
  displayId: CardDisplayId;
  titleSlug: string;
};

const CARD_FILENAME_PATTERN = /^([A-Za-z]+)-([0-9]+) - (.+)\.md$/;

export function parseCardFilename(filename: string): ParsedCardFilename | undefined {
  const match = CARD_FILENAME_PATTERN.exec(filename);
  if (!match) {
    return undefined;
  }
  return {
    displayId: { prefix: (match[1] ?? "").toUpperCase(), numericId: Number(match[2]) },
    titleSlug: match[3] ?? "",
  };
}

// ============================================================================
// 7. Backlog.md 独有的 11 个字段（Taskfold 不使用，但读写不得丢弃）
// ============================================================================

export type BacklogOnlyFrontmatterFields = {
  reporter?: string;
  dueDate?: string;
  references?: string[];
  documentation?: string[];
  modifiedFiles?: string[];
  parentTaskId?: string;
  subtasks?: string[];
  type?: string;
  project?: string;
  onStatusChange?: string;
  dependencies?: string[];
};

// ============================================================================
// 8. 顶层文档类型 + 序列化 / 反序列化
// ============================================================================

export type MarkdownCardDocument = {
  card: TaskfoldCard;
  displayId: CardDisplayId;
  backlogOnly: BacklogOnlyFrontmatterFields;
  /** `## Description` 哨兵区块内的原始正文，无内容时为 ""。 */
  descriptionBody: string;
  /** `## Acceptance Criteria` 哨兵区块内的原始正文；区块完全不存在时为 undefined。 */
  acceptanceCriteriaBody?: string;
  /** `## Definition of Done` 哨兵区块内的原始正文；区块完全不存在时为 undefined。 */
  definitionOfDoneBody?: string;
  /**
   * Description/AC/DoD/Taskfold 四个已识别区块之外的其余正文，按原始相对顺序原样保留
   * （不重新排版、不转义）——这些内容不是 Taskfold 写的，格式层不应该篡改。
   */
  trailing: string;
};

const DEFAULT_PRIORITY: TaskfoldPriority = "normal";

function buildTaskfoldSectionJson(card: TaskfoldCard): string {
  const payload: Record<string, unknown> = {
    uuid: card.id,
    revision: card.revision,
    // 完整精度的排序值，见文件头决策 4。
    position: card.position,
    // 毫秒精度的创建时间（frontmatter 的 created_date 只到分钟），见 resolvePreciseTimestamp。
    createdAt: card.createdAt,
  };
  if (card.kind !== undefined) payload.kind = card.kind;
  if (card.notes !== undefined) payload.notes = card.notes;
  if (card.sessionKey !== undefined) payload.sessionKey = card.sessionKey;
  if (card.runId !== undefined) payload.runId = card.runId;
  if (card.taskId !== undefined) payload.taskId = card.taskId;
  if (card.sourceUrl !== undefined) payload.sourceUrl = card.sourceUrl;
  if (card.execution !== undefined) payload.execution = card.execution;
  if (card.delivery !== undefined) payload.delivery = card.delivery;
  if (card.sourceReferences !== undefined) payload.sourceReferences = card.sourceReferences;
  if (card.startedAt !== undefined) payload.startedAt = card.startedAt;
  if (card.completedAt !== undefined) payload.completedAt = card.completedAt;
  if (card.events !== undefined) payload.events = card.events;
  if (card.metadata !== undefined) payload.metadata = card.metadata;
  return JSON.stringify(payload, null, 2);
}

export function serializeMarkdownCard(doc: MarkdownCardDocument): string {
  const { card, displayId, backlogOnly } = doc;

  const frontmatterEntries: ReadonlyArray<readonly [string, FrontmatterFieldValue]> = [
    ["id", formatCardFrontmatterId(displayId)],
    ["title", card.title],
    ["status", card.status],
    ["assignee", card.agentId ? [card.agentId] : []],
    ["reporter", backlogOnly.reporter],
    ["created_date", formatBacklogDateTime(card.createdAt)],
    ["updated_date", formatBacklogDateTime(card.updatedAt)],
    ["due_date", backlogOnly.dueDate],
    ["labels", card.labels ?? []],
    ["milestone", card.milestoneId],
    ["dependencies", backlogOnly.dependencies ?? []],
    [
      "references",
      backlogOnly.references && backlogOnly.references.length > 0 ? backlogOnly.references : undefined,
    ],
    [
      "documentation",
      backlogOnly.documentation && backlogOnly.documentation.length > 0 ? backlogOnly.documentation : undefined,
    ],
    [
      "modified_files",
      backlogOnly.modifiedFiles && backlogOnly.modifiedFiles.length > 0 ? backlogOnly.modifiedFiles : undefined,
    ],
    ["parent_task_id", backlogOnly.parentTaskId],
    ["subtasks", backlogOnly.subtasks && backlogOnly.subtasks.length > 0 ? backlogOnly.subtasks : undefined],
    ["priority", card.priority],
    ["type", backlogOnly.type],
    ["project", backlogOnly.project],
    // ⚠️ `position` 在 contract 里是必填 number，但外部写入者（人手工编辑 .md）可能让它
    // 变成非有限值。写出 `ordinal: NaN` 会产生真 js-yaml 读不回来的非法 YAML
    // （YAML 1.1 的非数只认 `.nan`），属静默且不可逆的文件损坏。非有限值时省略该键——
    // 与 backlog 自己 `task.ordinal !== undefined && { ordinal }` 的白名单规则一致；
    // 完整精度的 position 另存于 TASKFOLD 区块，信息不丢。
    ["ordinal", Number.isFinite(card.position) ? Math.round(card.position) : undefined],
    ["onStatusChange", backlogOnly.onStatusChange],
  ];

  const frontmatterText = stringifyFrontmatterBlock(frontmatterEntries);

  const bodyParts: string[] = [];
  bodyParts.push(buildSentinelSectionBlock("Description", "DESCRIPTION", escapeTaskfoldBodyText(doc.descriptionBody)));
  if (doc.acceptanceCriteriaBody !== undefined) {
    const acBlock = buildFlatMarkerBlockText("Acceptance Criteria", "AC", doc.acceptanceCriteriaBody);
    if (acBlock) bodyParts.push(acBlock);
  }
  if (doc.definitionOfDoneBody !== undefined) {
    const dodBlock = buildFlatMarkerBlockText("Definition of Done", "DOD", doc.definitionOfDoneBody);
    if (dodBlock) bodyParts.push(dodBlock);
  }
  if (doc.trailing.trim()) {
    bodyParts.push(doc.trailing.trim());
  }
  bodyParts.push(buildSentinelSectionBlock("Taskfold", "TASKFOLD", buildTaskfoldSectionJson(card)));

  const body = bodyParts.filter((part) => part.length > 0).join("\n\n");

  return `---\n${frontmatterText}\n---\n\n${body}\n`;
}

export function parseMarkdownCard(markdown: string): MarkdownCardDocument {
  const { frontmatter, body } = splitFrontmatter(markdown);
  const fm = parseFrontmatterBlock(frontmatter);
  const lines = body.split("\n");

  const displayIdRaw = requiredString(fm, "id");
  const displayId = parseCardFrontmatterId(displayIdRaw);
  if (!displayId) {
    throw new Error(`markdown-card-format: 无法解析 frontmatter id "${displayIdRaw}"`);
  }

  const taskfoldBlock = findSectionFamilyBlock(lines, "Taskfold", "TASKFOLD");
  if (!taskfoldBlock) {
    throw new Error(
      "markdown-card-format: 缺少 <!-- SECTION:TASKFOLD:BEGIN/END --> 区块——该文件尚未被 Taskfold 写入过。" +
        "把一张纯 backlog 卡片收编为 Taskfold 卡片（分配 UUID/revision 并首次写入 TASKFOLD 区块）属于存储" +
        "后端层的职责，不在格式层范围内，本函数对此直接抛错。",
    );
  }
  const taskfoldJsonText = lines.slice(taskfoldBlock.beginLineIndex + 1, taskfoldBlock.endLineIndex).join("\n");
  const payload = JSON.parse(taskfoldJsonText) as Record<string, unknown>;

  const status = requiredString(fm, "status") as TaskfoldStatus;
  const title = requiredString(fm, "title");
  const priorityRaw = stringValue(fm, "priority");
  const priority = (
    priorityRaw && (TASKFOLD_PRIORITIES as readonly string[]).includes(priorityRaw) ? priorityRaw : DEFAULT_PRIORITY
  ) as TaskfoldPriority;
  const assignee = arrayOfStrings(fm, "assignee");
  const agentId = assignee[0];
  const labels = arrayOfStrings(fm, "labels");
  const milestoneId = stringValue(fm, "milestone");
  const createdAt = resolvePreciseTimestamp(
    payload.createdAt,
    parseBacklogDateTime(requiredString(fm, "created_date")),
  );
  const updatedDateRaw = stringValue(fm, "updated_date");
  const updatedAt = updatedDateRaw ? parseBacklogDateTime(updatedDateRaw) : createdAt;

  const positionFromPayload = typeof payload.position === "number" ? payload.position : undefined;
  const ordinal = numberValue(fm, "ordinal");
  const position = positionFromPayload ?? ordinal ?? 0;

  const uuid = typeof payload.uuid === "string" && payload.uuid ? payload.uuid : displayIdRaw;
  const revision = typeof payload.revision === "number" ? payload.revision : 0;

  const card: TaskfoldCard = {
    id: uuid,
    title,
    status,
    priority,
    labels,
    position,
    createdAt,
    updatedAt,
    revision,
    ...(agentId ? { agentId } : {}),
    ...(milestoneId ? { milestoneId } : {}),
    ...(payload.kind !== undefined ? { kind: payload.kind as TaskfoldCardKind } : {}),
    ...(payload.notes !== undefined ? { notes: payload.notes as string } : {}),
    ...(payload.sessionKey !== undefined ? { sessionKey: payload.sessionKey as string } : {}),
    ...(payload.runId !== undefined ? { runId: payload.runId as string } : {}),
    ...(payload.taskId !== undefined ? { taskId: payload.taskId as string } : {}),
    ...(payload.sourceUrl !== undefined ? { sourceUrl: payload.sourceUrl as string } : {}),
    ...(payload.execution !== undefined ? { execution: payload.execution as TaskfoldExecution } : {}),
    ...(payload.delivery !== undefined ? { delivery: payload.delivery as TaskfoldDelivery } : {}),
    ...(payload.sourceReferences !== undefined
      ? { sourceReferences: payload.sourceReferences as TaskfoldSourceReference[] }
      : {}),
    ...(payload.startedAt !== undefined ? { startedAt: payload.startedAt as number } : {}),
    ...(payload.completedAt !== undefined ? { completedAt: payload.completedAt as number } : {}),
    ...(payload.events !== undefined ? { events: payload.events as TaskfoldEvent[] } : {}),
    ...(payload.metadata !== undefined ? { metadata: payload.metadata as TaskfoldMetadata } : {}),
  };

  const backlogOnlyRaw: BacklogOnlyFrontmatterFields = {
    ...(stringValue(fm, "reporter") ? { reporter: stringValue(fm, "reporter") } : {}),
    ...(stringValue(fm, "due_date") ? { dueDate: stringValue(fm, "due_date") } : {}),
    ...(arrayOfStrings(fm, "references").length ? { references: arrayOfStrings(fm, "references") } : {}),
    ...(arrayOfStrings(fm, "documentation").length ? { documentation: arrayOfStrings(fm, "documentation") } : {}),
    ...(arrayOfStrings(fm, "modified_files").length
      ? { modifiedFiles: arrayOfStrings(fm, "modified_files") }
      : {}),
    ...(stringValue(fm, "parent_task_id") ? { parentTaskId: stringValue(fm, "parent_task_id") } : {}),
    ...(arrayOfStrings(fm, "subtasks").length ? { subtasks: arrayOfStrings(fm, "subtasks") } : {}),
    ...(stringValue(fm, "type") ? { type: stringValue(fm, "type") } : {}),
    ...(stringValue(fm, "project") ? { project: stringValue(fm, "project") } : {}),
    ...(stringValue(fm, "onStatusChange") ? { onStatusChange: stringValue(fm, "onStatusChange") } : {}),
    ...(arrayOfStrings(fm, "dependencies").length ? { dependencies: arrayOfStrings(fm, "dependencies") } : {}),
  };
  const backlogOnly = optional(backlogOnlyRaw) ?? {};

  const descriptionBlock = findSectionFamilyBlock(lines, "Description", "DESCRIPTION");
  const descriptionBody = descriptionBlock
    ? lines.slice(descriptionBlock.beginLineIndex + 1, descriptionBlock.endLineIndex).join("\n")
    : "";

  const acBlock = findFlatMarkerBlock(lines, "Acceptance Criteria", "AC");
  const acceptanceCriteriaBody = acBlock
    ? lines.slice(acBlock.beginLineIndex + 1, acBlock.endLineIndex).join("\n")
    : undefined;

  const dodBlock = findFlatMarkerBlock(lines, "Definition of Done", "DOD");
  const definitionOfDoneBody = dodBlock
    ? lines.slice(dodBlock.beginLineIndex + 1, dodBlock.endLineIndex).join("\n")
    : undefined;

  const consumedLineIndexes = new Set<number>();
  const markConsumed = (block: SentinelBlockLocation | undefined) => {
    if (!block) return;
    for (let i = block.headingLineIndex; i <= block.endLineIndex; i += 1) {
      consumedLineIndexes.add(i);
    }
  };
  markConsumed(descriptionBlock);
  markConsumed(acBlock);
  markConsumed(dodBlock);
  markConsumed(taskfoldBlock);
  const trailing = lines
    .filter((_line, index) => !consumedLineIndexes.has(index))
    .join("\n")
    .trim();

  return {
    card,
    displayId,
    backlogOnly,
    descriptionBody,
    acceptanceCriteriaBody,
    definitionOfDoneBody,
    trailing,
  };
}

// ============================================================================
// 9. 定位专用：只读 TASKFOLD 区块的 uuid，不做全量 parseMarkdownCard/parseMarkdownMilestone
//    （文件后端按 uuid 反查文件路径时用；卡片与里程碑的 TASKFOLD 区块都遵循同一套
//    "## Taskfold" + JSON { uuid, ... } 约定，共享同一个函数）。
// ============================================================================

/**
 * 展示 ID 分配接入写路径后，文件名不再包含 uuid（`card.id`/`milestone.id`），文件后端的
 * `lookup(uuid)` 反查必须改成扫目录 + 读内容匹配，不能再靠文件名。已实测：entries() 全量
 * 解析的耗时里 80~84% 花在解析上（I/O 只占 16~20%），而反查只需要 TASKFOLD 区块里的 uuid
 * 一个字段——所以这里不复用 parseMarkdownCard/parseMarkdownMilestone（两者都要建出完整的
 * 业务对象、解析全部 frontmatter 字段），只做够用的最小解析：定位 TASKFOLD 哨兵区块，
 * JSON.parse 它的内容，取 uuid 字段。
 *
 * 解析失败（甚至找不到 frontmatter 分隔符或 TASKFOLD 区块）时返回 undefined，而不是抛错：
 * 调用方应该把它当"这份文件认不出是谁"，跳过继续扫下一个候选文件——同 entries() 的坏文件
 * 隔离哲学（一个坏文件不能拖垮整份列表），不应该被无关的畸形文件放大成"整次查找都失败"。
 */
export function extractTaskfoldSectionUuid(markdown: string): string | undefined {
  try {
    const { body } = splitFrontmatter(markdown);
    const lines = body.split("\n");
    const block = findSectionFamilyBlock(lines, "Taskfold", "TASKFOLD");
    if (!block) {
      return undefined;
    }
    const jsonText = lines.slice(block.beginLineIndex + 1, block.endLineIndex).join("\n");
    const payload = JSON.parse(jsonText) as Record<string, unknown>;
    return typeof payload.uuid === "string" && payload.uuid ? payload.uuid : undefined;
  } catch {
    return undefined;
  }
}
