// 构建独立的 `taskfold` CLI：把 src/bin.ts 连同 @taskfold/core、commander、proper-lockfile
// 打成一个自包含的 ESM 文件（默认 `packages/cli/dist/taskfold.js`），拷到哪都能用 node 直接跑，
// 不依赖 node_modules、OpenClaw 或 Gateway。
//
// 用法：`node scripts/build.mjs [--outfile <path>]`（测试用 --outfile 打到临时目录，不碰 dist/）。
//
// banner 里的 createRequire：proper-lockfile 及其依赖是 CommonJS，esbuild 在 ESM 产物里把它们的
// `require("fs")` 等改写成 `__require`，没有真正的 `require` 时会在运行期抛
// "Dynamic require of ... is not supported"。
import * as esbuild from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const { values } = parseArgs({ options: { outfile: { type: "string" } } });
const outfile = path.resolve(values.outfile ?? path.join(PACKAGE_DIR, "dist", "taskfold.js"));

await esbuild.build({
  entryPoints: [path.join(PACKAGE_DIR, "src", "bin.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  banner: {
    js: [
      "#!/usr/bin/env node",
      'import { createRequire as __taskfoldCreateRequire } from "node:module";',
      "const require = __taskfoldCreateRequire(import.meta.url);",
    ].join("\n"),
  },
  logLevel: "warning",
});
await fs.chmod(outfile, 0o755);
