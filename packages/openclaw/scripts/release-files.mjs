// 打包前把仓库根目录的发布文件同步进本包目录，打包后再清掉副本。
//
// `npm pack` 的 `files` 白名单只能引用包目录内部的路径，不能用 `../` 指到 monorepo 根目录，
// 所以 README.md / LICENSE / THIRD-PARTY-NOTICES / UPSTREAM.md / docs/CLAW_HUB_PUBLISHING.md
// 这五份文件只在仓库根保留一份源文件，本脚本负责在打包前后临时复制/清理。
//
// 这一步必须是显式调用的独立脚本，不能只靠 npm 的 `prepack`/`postpack` 生命周期钩子：
// ClawHub CLI（`clawhub package publish` / `clawhub package validate`）在内部固定用
// `npm pack <dir> --json --ignore-scripts` 打包（见 clawhub 包 dist/cli/commands/packages.js
// 的 createClawPackFromFolder()），`--ignore-scripts` 会让 prepack/postpack 完全不触发。
// 所以本仓库发布检查清单（docs/CLAW_HUB_PUBLISHING.md）在调用任何打包/发布/校验命令之前，
// 都要先显式跑一遍 `copy`，跑完之后再显式 `clean`。
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT_DIR = path.resolve(PACKAGE_DIR, "..", "..");

/** 与 `packages/openclaw/package.json` 的 `files` 白名单一一对应（`dist/` 和
 * `openclaw.plugin.json` 已经就地存在，不需要同步）。 */
export const RELEASE_FILES = [
  "README.md",
  "LICENSE",
  "THIRD-PARTY-NOTICES",
  "UPSTREAM.md",
  "docs/CLAW_HUB_PUBLISHING.md",
];

export async function copyReleaseFiles() {
  for (const relativePath of RELEASE_FILES) {
    const from = path.join(ROOT_DIR, relativePath);
    const to = path.join(PACKAGE_DIR, relativePath);
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(from, to);
  }
}

export async function cleanReleaseFiles() {
  for (const relativePath of RELEASE_FILES) {
    await fs.rm(path.join(PACKAGE_DIR, relativePath), { force: true });
  }
  // docs/ 目录只为承载 CLAW_HUB_PUBLISHING.md 的副本而临时创建，清理后如果已空就一并删掉，
  // 不在包目录下留下空目录。
  const docsDir = path.join(PACKAGE_DIR, "docs");
  const remaining = await fs.readdir(docsDir).catch(() => null);
  if (remaining && remaining.length === 0) {
    await fs.rmdir(docsDir);
  }
}

async function main() {
  const mode = process.argv[2];
  if (mode === "copy") {
    await copyReleaseFiles();
  } else if (mode === "clean") {
    await cleanReleaseFiles();
  } else {
    console.error("Usage: node scripts/release-files.mjs <copy|clean>");
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
