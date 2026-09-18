// 构建 Taskfold 的原生 Control UI 产物（`需求/15.9-ControlUI注入调查.md` 第 3 步）。
//
// 为什么不用 `openclaw plugins build`：那条 CLI 命令在打包 controlUi 之前会无条件跑
// `loadToolPlugin()`，要求后端入口必须是声明式的 `defineToolPlugin()`/`defineFeaturePlugin()`。
// Taskfold 走的是命令式 `definePluginEntry()`，跑那条命令必然在校验阶段失败，与 controlUi
// 构建本身无关（详见调查文档 Q1）。
//
// 本脚本直接用仓库已有的 esbuild 复刻宿主内部原语 `buildPluginControlUi()`
// （`plugins-authoring-command-*.mjs` 里的 `buildPluginBundle()` + `buildPluginControlUi()`）
// 的关键约束，但不依赖该函数本身（它是宿主包内部实现，未导出、无法直接调用）：
//   - bundle:true + format:"esm" + platform:"browser"，不声明任何 external，
//     保证产物零外部 import（自包含）。
//   - 单文件 ≤4MiB、总体积 ≤8MiB（`control-ui-assets-*.mjs` 里
//     `CONTROL_UI_PLUGIN_MAX_ASSET_BYTES`/`CONTROL_UI_PLUGIN_MAX_BUILD_BYTES` 的实测值）。
//   - tsconfigRaw 打开 experimentalDecorators，为将来第 4 步迁移 Lit 组件预留装饰器语法
//     （Taskfold 现有 Lit 用法目前不用装饰器，这里只是不给将来挖坑）。
//
// 产物落在顶层 `dist/control-ui/`（不是 `ui/dist/`），因为宿主对 `openclaw.plugin.json`
// 的 `controlUi.entry` 有硬编码正则 `^dist\/(?:[\w-][\w.-]*\/)+[\w-][\w.-]*\.m?js$`：
// 必须以字面量 `dist/` 开头，且至少嵌套一层子目录。
import * as esbuild from "esbuild";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY_SOURCE = path.join(ROOT_DIR, "browser/index.ts");
const OUT_DIR = path.join(ROOT_DIR, "dist/control-ui");
const MANIFEST_PATH = path.join(ROOT_DIR, "openclaw.plugin.json");

const MAX_ASSET_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const ENTRY_REGEX = /^dist\/(?:[\w-][\w.-]*\/)+[\w-][\w.-]*\.m?js$/u;

/**
 * 手写 `controlUi` 块的文本，而不是对整份 manifest 做 `JSON.stringify`——后者会把
 * `openclaw.plugin.json` 里所有手写的紧凑数组（如 `["taskfold"]`）展开成多行，
 * 产生一堆与本次改动无关的格式噪音。
 */
function buildControlUiBlockText(entry, styles) {
  const lines = [`"controlUi": {`, `    "entry": ${JSON.stringify(entry)}`];
  if (styles && styles.length > 0) {
    lines[1] += ",";
    lines.push(`    "styles": ${JSON.stringify(styles)}`);
  }
  lines.push(`  }`);
  return lines.join("\n");
}

/** 从 `openBraceIndex` 处的 `{` 开始，找到与之配对的 `}` 的下标（假定花括号平衡）。 */
function findMatchingBraceEnd(text, openBraceIndex) {
  let depth = 0;
  for (let index = openBraceIndex; index < text.length; index += 1) {
    const char = text[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  throw new Error("openclaw.plugin.json 中 controlUi 块的花括号不平衡");
}

/**
 * 原地替换/插入根级 `controlUi` 属性，其余内容与原始文本逐字节保持一致。
 * 已存在则整块替换（幂等，重复跑 `npm run build:control-ui` 不会越改越乱）；
 * 不存在则作为根对象的最后一个属性插入。
 */
function upsertControlUiBlock(raw, entry, styles) {
  const blockText = buildControlUiBlockText(entry, styles);
  const keyMatch = /"controlUi"\s*:\s*\{/.exec(raw);
  if (keyMatch) {
    const openBrace = raw.indexOf("{", keyMatch.index);
    const closeBrace = findMatchingBraceEnd(raw, openBrace);
    return raw.slice(0, keyMatch.index) + blockText + raw.slice(closeBrace + 1);
  }
  const lastBraceIndex = raw.lastIndexOf("}");
  if (lastBraceIndex === -1) {
    throw new Error("openclaw.plugin.json 缺少根对象的闭合花括号");
  }
  const before = raw.slice(0, lastBraceIndex).replace(/\s+$/, "");
  const after = raw.slice(lastBraceIndex);
  return `${before},\n  ${blockText}\n${after}`;
}

async function build() {
  const result = await esbuild.build({
    entryPoints: { index: ENTRY_SOURCE },
    absWorkingDir: ROOT_DIR,
    outdir: OUT_DIR,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    write: false,
    metafile: true,
    minify: true,
    legalComments: "none",
    sourcemap: false,
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
    },
  });

  // 自包含校验：产物里不能剩任何未打包的外部 import。由于构建时没有声明任何
  // `external`，esbuild 在无法内联某个 import 时会直接报错而不是静默放行，
  // 这里的 metafile 检查是双保险，而不是唯一防线。
  const externalImports = Object.values(result.metafile.outputs)
    .flatMap((output) => output.imports)
    .filter((entry) => entry.external);
  if (externalImports.length > 0) {
    throw new Error(
      `control-ui 产物存在未打包的外部 import：${externalImports.map((entry) => entry.path).join(", ")}`,
    );
  }

  let totalBytes = 0;
  for (const file of result.outputFiles) {
    if (file.contents.byteLength > MAX_ASSET_BYTES) {
      throw new Error(
        `产物 ${path.basename(file.path)} 为 ${file.contents.byteLength} 字节，超过单文件 ${MAX_ASSET_BYTES} 字节限制`,
      );
    }
    totalBytes += file.contents.byteLength;
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    throw new Error(`control-ui 产物总体积 ${totalBytes} 字节，超过 ${MAX_TOTAL_BYTES} 字节限制`);
  }

  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  const writtenBasenames = [];
  for (const file of result.outputFiles) {
    const basename = path.basename(file.path);
    await fs.writeFile(path.join(OUT_DIR, basename), file.contents);
    writtenBasenames.push(basename);
  }

  const entryRelative = "dist/control-ui/index.js";
  if (!writtenBasenames.includes("index.js")) {
    throw new Error("control-ui 构建未产出 index.js");
  }
  if (!ENTRY_REGEX.test(entryRelative)) {
    // 只要 OUT_DIR 常量不被改动这里不会触发，留作防止将来误改路径的断言。
    throw new Error(`entry 路径 ${entryRelative} 不匹配宿主正则 ${ENTRY_REGEX}`);
  }
  const stylesRelative = writtenBasenames.includes("index.css") ? ["dist/control-ui/index.css"] : undefined;

  const manifestRaw = await fs.readFile(MANIFEST_PATH, "utf8");
  const patchedManifest = upsertControlUiBlock(manifestRaw, entryRelative, stylesRelative);
  // 写回前用 JSON.parse 复核一遍，防止文本拼接产生的非法 JSON 静默落盘。
  JSON.parse(patchedManifest);
  await fs.writeFile(MANIFEST_PATH, patchedManifest);

  const contentHash = createHash("sha256");
  for (const file of result.outputFiles) {
    contentHash.update(file.contents);
  }
  console.log(
    `control-ui 构建完成：${writtenBasenames.join(", ")}（共 ${totalBytes} 字节，sha256=${contentHash.digest("hex").slice(0, 12)}…），已写回 openclaw.plugin.json 的 controlUi 字段`,
  );
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
