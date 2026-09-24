// TASK-5：AI 指引——AGENTS.md / CLAUDE.md 的版本化标记块与 `taskfold instructions`（需求/18 §4），
// 以及 TTY 才着色的输出规则。进程内调用，全部落在临时目录。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "@taskfold/cli/cli.js";
import { TaskfoldCliError } from "@taskfold/cli/errors.js";
import {
  renderGuidelinesBlock,
  renderInstructions,
  upsertGuidelinesBlock,
  writeGuidelines,
} from "@taskfold/cli/guidelines.js";
import { TASKFOLD_CLI_VERSION } from "@taskfold/cli/version.js";
import { cleanupTempDirs, makeTempDir, makeTempGitRepo } from "./helpers/cli-harness.js";

const cliPackageJson = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "packages",
  "cli",
  "package.json",
);

afterEach(() => {
  cleanupTempDirs();
});

function capture(isTTY: boolean) {
  let text = "";
  return {
    stream: { isTTY, write: (chunk: string) => (text += chunk) },
    text: () => text,
  };
}

describe("标记块与 instructions 的版本跟 CLI 对齐", () => {
  it("CLI 版本常量与 package.json 一致，标记块、instructions、--version 都用它", async () => {
    const pkg = JSON.parse(fs.readFileSync(cliPackageJson, "utf8")) as { version: string };
    expect(TASKFOLD_CLI_VERSION).toBe(pkg.version);
    expect(renderGuidelinesBlock().split("\n")[0]).toBe(`<!-- TASKFOLD GUIDELINES START v${pkg.version} -->`);
    expect(renderInstructions().split("\n")[0]).toBe(`# Taskfold CLI instructions (v${pkg.version})`);
    const stdout = capture(false);
    const code = await runCli({
      argv: ["--version"],
      cwd: makeTempDir("taskfold-cli-version-"),
      env: {},
      stdout: stdout.stream,
      stderr: capture(false).stream,
    });
    expect(code).toBe(0);
    expect(stdout.text().trim()).toBe(pkg.version);
  });

  it("标记块很短，写明不要直接编辑 .taskfold/ 下的 md、按需跑 taskfold instructions", () => {
    const block = renderGuidelinesBlock();
    expect(block.split("\n").length).toBeLessThanOrEqual(15);
    expect(block).toContain("Never create, edit, move or delete files under `.taskfold/` directly");
    expect(block).toContain("`.md` card files");
    expect(block).toContain("taskfold instructions");
    expect(block.endsWith("<!-- TASKFOLD GUIDELINES END -->")).toBe(true);
  });
});

describe("upsertGuidelinesBlock / writeGuidelines：重复执行就地更新，不重复追加", () => {
  it("新文件 → created；再跑 → unchanged；已有正文 → 追加在末尾且原文不动", () => {
    expect(upsertGuidelinesBlock(undefined)).toEqual({ content: `${renderGuidelinesBlock()}\n`, action: "created" });
    const once = upsertGuidelinesBlock("# Project\n\nRules.\n");
    expect(once.action).toBe("inserted");
    expect(once.content).toBe(`# Project\n\nRules.\n\n${renderGuidelinesBlock()}\n`);
    expect(upsertGuidelinesBlock(once.content)).toEqual({ content: once.content, action: "unchanged" });
  });

  it("旧版本的块被就地换成新版本，前后内容原样保留，只留一份", () => {
    const old = "# A\n\n<!-- TASKFOLD GUIDELINES START v0.0.1 -->\nold text\n<!-- TASKFOLD GUIDELINES END -->\n\n## After\n";
    const { content, action } = upsertGuidelinesBlock(old);
    expect(action).toBe("updated");
    expect(content).toBe(`# A\n\n${renderGuidelinesBlock()}\n\n## After\n`);
    expect(content.match(/TASKFOLD GUIDELINES START/g)).toHaveLength(1);

    const duplicated = `${old}\n<!-- TASKFOLD GUIDELINES START v0.0.2 -->\nx\n<!-- TASKFOLD GUIDELINES END -->\n`;
    expect(upsertGuidelinesBlock(duplicated).content.match(/TASKFOLD GUIDELINES START/g)).toHaveLength(1);
  });

  it("START/END 不成对时拒绝改动", () => {
    expect(() => upsertGuidelinesBlock("<!-- TASKFOLD GUIDELINES START v1 -->\nno end\n")).toThrow(TaskfoldCliError);
    expect(() => upsertGuidelinesBlock("text\n<!-- TASKFOLD GUIDELINES END -->\n")).toThrow(/unbalanced/);
  });

  it("CLAUDE.md 是指向 AGENTS.md 的符号链接：只写一次，链接保留", () => {
    const dir = makeTempDir("taskfold-cli-guidelines-");
    const agents = path.join(dir, "AGENTS.md");
    const claude = path.join(dir, "CLAUDE.md");
    fs.writeFileSync(agents, "# Agents\n");
    fs.symlinkSync("AGENTS.md", claude);
    const results = writeGuidelines([agents, claude]);
    expect(results).toEqual([{ path: agents, action: "inserted" }]);
    expect(fs.lstatSync(claude).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(agents, "utf8").match(/TASKFOLD GUIDELINES START/g)).toHaveLength(1);
    expect(writeGuidelines([agents, claude])).toEqual([{ path: agents, action: "unchanged" }]);
  });

  it("`taskfold guidelines` 默认写仓库根的 AGENTS.md 与 CLAUDE.md，重跑不追加", async () => {
    const repo = makeTempGitRepo();
    const sub = path.join(repo, "src");
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(repo, "AGENTS.md"), "# Existing\n");
    const run = async () =>
      await runCli({ argv: ["guidelines"], cwd: sub, env: {}, stdout: capture(false).stream, stderr: capture(false).stream });
    expect(await run()).toBe(0);
    expect(await run()).toBe(0);
    for (const file of ["AGENTS.md", "CLAUDE.md"]) {
      const text = fs.readFileSync(path.join(repo, file), "utf8");
      expect(text.match(/TASKFOLD GUIDELINES START/g), file).toHaveLength(1);
    }
    expect(fs.readFileSync(path.join(repo, "AGENTS.md"), "utf8").startsWith("# Existing\n")).toBe(true);
  });
});

describe("颜色只给 TTY", () => {
  it("stdout 是 TTY 时着色；不是 TTY、或设了 NO_COLOR 时纯文本", async () => {
    const repo = makeTempGitRepo();
    const quiet = { stdout: capture(false).stream, stderr: capture(false).stream };
    expect(await runCli({ argv: ["init"], cwd: repo, env: {}, ...quiet })).toBe(0);
    expect(await runCli({ argv: ["create", "Colored"], cwd: repo, env: {}, ...quiet })).toBe(0);
    const list = async (isTTY: boolean, env: NodeJS.ProcessEnv) => {
      const stdout = capture(isTTY);
      expect(await runCli({ argv: ["list"], cwd: repo, env, stdout: stdout.stream, stderr: capture(false).stream })).toBe(0);
      return stdout.text();
    };
    expect(await list(true, {})).toMatch(/\u001b\[/);
    expect(await list(false, {})).not.toMatch(/\u001b\[/);
    expect(await list(true, { NO_COLOR: "1" })).not.toMatch(/\u001b\[/);
  });
});
