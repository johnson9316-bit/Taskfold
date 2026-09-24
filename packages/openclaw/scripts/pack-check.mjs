// 校验 `packages/openclaw` 的打包产物：补齐发布文件、用 ClawHub CLI 实际调用打包时的
// 同款参数（`npm pack --ignore-scripts`，见 release-files.mjs 顶部注释）复刻一遍，
// 再核对文件清单——必需文件必须齐全，不能有源码、测试或任何白名单之外的多余文件。
// 无论成功还是失败，结束前都会清掉临时复制进来的发布文件副本。
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyReleaseFiles, cleanReleaseFiles } from "./release-files.mjs";

const PACKAGE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 对应 package.json 的 `files` 白名单展开后的最终产物：dist/ 内的 4 个构建产物、
// openclaw.plugin.json、package.json（npm 总是隐式打包），以及从仓库根同步来的 5 份
// 发布文件。多一个少一个都判失败，而不是只检查「必需文件是否存在」。
const EXPECTED_FILES = [
  "package.json",
  "openclaw.plugin.json",
  "README.md",
  "LICENSE",
  "THIRD-PARTY-NOTICES",
  "UPSTREAM.md",
  "docs/CLAW_HUB_PUBLISHING.md",
  "dist/index.js",
  "dist/doctor-contract-api.js",
  "dist/control-ui/index.js",
  "dist/control-ui/index.css",
].sort();

async function main() {
  await copyReleaseFiles();

  // `--ignore-scripts` 特意复刻 ClawHub CLI 的真实调用方式：靠 npm 生命周期钩子
  // （prepack/postpack）做同步的方案在真实发布路径里根本不会触发，所以这里不依赖它们，
  // 直接验证「文件已经就地存在」这件事本身够不够。
  const packResult = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: PACKAGE_DIR,
    encoding: "utf8",
  });
  if (packResult.error) {
    throw packResult.error;
  }
  if (packResult.status !== 0) {
    throw new Error(`npm pack 失败：\n${(packResult.stderr || packResult.stdout || "").trim()}`);
  }

  const [summary] = JSON.parse(packResult.stdout);
  const actualFiles = summary.files.map((entry) => entry.path).sort();

  console.log(`package: ${summary.name}@${summary.version}`);
  console.log(`files (${actualFiles.length}):`);
  for (const entry of summary.files) {
    console.log(`  ${entry.path}  (${entry.size} B)`);
  }

  const missing = EXPECTED_FILES.filter((file) => !actualFiles.includes(file));
  const extra = actualFiles.filter((file) => !EXPECTED_FILES.includes(file));

  if (missing.length > 0) {
    console.error(`缺少必需文件: ${missing.join(", ")}`);
  }
  if (extra.length > 0) {
    console.error(`出现白名单之外的多余文件: ${extra.join(", ")}`);
  }
  if (missing.length > 0 || extra.length > 0) {
    throw new Error("产物内容与预期不一致。");
  }

  console.log("产物内容与预期一致。");
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  exitCode = 1;
} finally {
  await cleanReleaseFiles();
}

process.exit(exitCode);
