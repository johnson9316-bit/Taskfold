#!/usr/bin/env node
// 默认仅预览；只操作显式指定的仓库，不打开宿主注册表或其他项目。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { build } from "esbuild";

const { values } = parseArgs({ options: {
  repo: { type: "string" },
  apply: { type: "boolean", default: false },
  "backup-dir": { type: "string" },
} });
if (!values.repo) throw new Error("用法：node scripts/migrate-milestone-names.mjs --repo <仓库> [--apply --backup-dir <仓库外目录>]");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-migration-build-"));
try {
  const outfile = path.join(scratch, "migration.cjs");
  await build({
    entryPoints: [fileURLToPath(new URL("../packages/core/src/file-store-milestone-migration.ts", import.meta.url))],
    outfile, bundle: true, platform: "node", format: "cjs", target: "node24",
  });
  const { migrateTaskfoldMilestones } = createRequire(import.meta.url)(outfile);
  console.log(JSON.stringify(await migrateTaskfoldMilestones({
    dataDir: path.join(path.resolve(values.repo), ".taskfold"),
    apply: values.apply,
    backupRoot: values["backup-dir"],
  }), null, 2));
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
