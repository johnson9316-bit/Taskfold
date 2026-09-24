// 构建 Taskfold VS Code 扩展（需求/18 §5）：
// - 扩展进程：src/extension.ts 连同 @taskfold/core、@taskfold/cli 里用到的部分、proper-lockfile
//   打成一个自包含的 CommonJS 文件 dist/extension.js，只把 `vscode` 留作外部模块。装好的 .vsix
//   不依赖仓库路径和 node_modules。
// - Webview：packages/ui 的 src/vscode-index.ts（复用 packages/ui 的 Lit 看板）打成 media/webview.js 与
//   media/webview.css。CSP 只允许扩展 media 目录下的样式和带 nonce 的脚本，所以产物必须是
//   外链文件，不能内联。
// - 顺带把仓库根的 LICENSE 复制过来，供 vsce 打进 .vsix。
//
// 用法：`node scripts/build.mjs`（`npm run package -w packages/vscode` 会先跑它再调 vsce）。
import * as esbuild from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT_DIR = path.resolve(PACKAGE_DIR, "..", "..");
const DIST_DIR = path.join(PACKAGE_DIR, "dist");
const MEDIA_DIR = path.join(PACKAGE_DIR, "media");

await fs.rm(DIST_DIR, { recursive: true, force: true });
await fs.rm(MEDIA_DIR, { recursive: true, force: true });

await esbuild.build({
  entryPoints: [path.join(PACKAGE_DIR, "src", "extension.ts")],
  outfile: path.join(DIST_DIR, "extension.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  // VS Code 1.100 起扩展宿主是 Node 20 以上。
  target: "node20",
  external: ["vscode"],
  logLevel: "warning",
});

await esbuild.build({
  entryPoints: { webview: path.join(ROOT_DIR, "packages", "ui", "src", "vscode-index.ts") },
  outdir: MEDIA_DIR,
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
  minify: true,
  legalComments: "none",
  // 与 packages/openclaw/scripts/build-control-ui.mjs 一致。
  tsconfigRaw: {
    compilerOptions: {
      experimentalDecorators: true,
      useDefineForClassFields: false,
    },
  },
  logLevel: "warning",
});

await fs.copyFile(path.join(ROOT_DIR, "LICENSE"), path.join(PACKAGE_DIR, "LICENSE"));

for (const file of ["dist/extension.js", "media/webview.js", "media/webview.css"]) {
  const { size } = await fs.stat(path.join(PACKAGE_DIR, file));
  console.log(`${file}  ${(size / 1024).toFixed(1)} KiB`);
}
