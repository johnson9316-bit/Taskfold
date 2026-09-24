// CLI 测试的公共夹具：把 packages/cli 打成一个临时 bundle（与 `npm run build -w @taskfold/cli`
// 同一个构建脚本，只是 --outfile 指到临时目录，不碰 dist/），在临时 git 仓库里以真实子进程运行它，
// 拿真实的退出码、stdout、stderr。所有仓库都建在系统临时目录下，用完删除。
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const helpersDir = path.join(repoRoot, "test", "helpers");

const tempRoots: string[] = [];

export function makeTempDir(prefix: string): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  tempRoots.push(dir);
  return dir;
}

export function cleanupTempDirs(): void {
  for (const dir of tempRoots.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** 构建一份临时 CLI bundle，返回它的路径。 */
export function buildCliBundle(): string {
  const outfile = path.join(makeTempDir("taskfold-cli-bundle-"), "taskfold.js");
  execFileSync(process.execPath, [path.join(repoRoot, "packages", "cli", "scripts", "build.mjs"), "--outfile", outfile], {
    stdio: "pipe",
  });
  return outfile;
}

/** 一个空的临时 git 仓库（没有 `.taskfold/`）。 */
export function makeTempGitRepo(): string {
  const dir = makeTempDir("taskfold-cli-repo-");
  execFileSync("git", ["init", "-q", dir], { stdio: "pipe" });
  return dir;
}

export type CliRun = { code: number; stdout: string; stderr: string };

export async function runCliProcess(
  bundle: string,
  args: readonly string[],
  options: { cwd: string; input?: string; env?: NodeJS.ProcessEnv },
): Promise<CliRun> {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bundle, ...args], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
    child.stdin.end(options.input ?? "");
  });
}

/** 跑一个 `--json` 命令并解析 stdout；非零退出直接让测试失败（带上 stderr）。 */
export async function runJson(
  bundle: string,
  args: readonly string[],
  options: { cwd: string; input?: string },
): Promise<Record<string, any>> {
  const result = await runCliProcess(bundle, [...args, "--json"], options);
  if (result.code !== 0) {
    throw new Error(`taskfold ${args.join(" ")} exited ${result.code}: ${result.stderr}`);
  }
  return JSON.parse(result.stdout) as Record<string, any>;
}

/** 在 `.taskfold/cards/` 里找到某张卡（按 TASKFOLD 区块里的 uuid）的文件路径。 */
export function cardFilePath(repo: string, cardId: string): string {
  const cardsDir = path.join(repo, ".taskfold", "cards");
  const match = fs
    .readdirSync(cardsDir)
    .map((name) => path.join(cardsDir, name))
    .find((file) => fs.readFileSync(file, "utf8").includes(`"uuid": "${cardId}"`));
  if (!match) {
    throw new Error(`card file for ${cardId} not found`);
  }
  return match;
}

export type LockHolder = { release(): Promise<void> };

/** 在另一个进程里拿住一把锁（test/helpers/cli-lock-holder.ts），拿到后才返回。 */
export async function holdLockInAnotherProcess(target: string, lockfilePath: string): Promise<LockHolder> {
  const child = spawn(
    process.execPath,
    ["--import", path.join(helpersDir, "ts-resolve-hooks.mjs"), path.join(helpersDir, "cli-lock-holder.ts"), target, lockfilePath],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let stderr = "";
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const exited = new Promise<void>((resolve) => child.on("close", () => resolve()));
  await new Promise<void>((resolve, reject) => {
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.includes("locked\n")) {
        resolve();
      }
    });
    child.on("close", (code) => reject(new Error(`lock holder exited early (${code}): ${stderr}`)));
  });
  return {
    async release() {
      child.stdin.end();
      await exited;
    },
  };
}
