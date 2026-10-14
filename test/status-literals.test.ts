import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 需求/22-状态模型：引擎只认类别、role 与卡片标记，不比较状态名。这条守门测试让"又在引擎里写
// `card.status === "running"`"的回退在 CI 里直接失败。判断请走 card-phase.ts / status-registry.ts。
const ENGINE_DIRS = ["packages/core/src", "packages/openclaw/src/backend/src"];
const EXEMPT = new Set(["status-registry.ts", "card-phase.ts"]);
// 卡片对象上的 `.status` 与字符串字面量比较（执行 / 尝试 / 证明的 status 是另一套枚举，不在此列）。
const CARD_STATUS_LITERAL = /\b(card|existing|latest|guarded|parent|child|next|entry|claimable|reclaimed)\.status\s*[!=]==?\s*"/;
// 把状态当字面量写进补丁：`status: "running"`（execution / attempts 的 status 不会出现在这几个文件里）。
const STATUS_PATCH_LITERAL = /^\s*status:\s*"(triage|backlog|todo|scheduled|ready|running|review|blocked|done|cancelled)"/;
const PATCH_LITERAL_FILES = new Set([
  "store-core.ts",
  "store-dispatch.ts",
  "store-enrichment.ts",
  "store-projects.ts",
  "store-promote.ts",
  "reconciler.ts",
  "lifecycle.ts",
]);

function engineFiles(): string[] {
  return ENGINE_DIRS.flatMap((dir) =>
    fs
      .readdirSync(path.join(process.cwd(), dir))
      .filter((name) => name.endsWith(".ts") && !EXEMPT.has(name))
      .map((name) => path.join(dir, name)),
  );
}

describe("引擎不比较卡片状态名", () => {
  it("没有 `card.status === \"…\"` 这类比较", () => {
    const hits: string[] = [];
    for (const file of engineFiles()) {
      fs.readFileSync(path.join(process.cwd(), file), "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (CARD_STATUS_LITERAL.test(line) && !line.trimStart().startsWith("//")) {
            hits.push(`${file}:${index + 1}: ${line.trim()}`);
          }
        });
    }
    expect(hits).toEqual([]);
  });

  it("没有把状态名写死进补丁（走 phasePatch）", () => {
    const hits: string[] = [];
    for (const file of engineFiles().filter((entry) => PATCH_LITERAL_FILES.has(path.basename(entry)))) {
      fs.readFileSync(path.join(process.cwd(), file), "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (STATUS_PATCH_LITERAL.test(line)) {
            hits.push(`${file}:${index + 1}: ${line.trim()}`);
          }
        });
    }
    expect(hits).toEqual([]);
  });
});
