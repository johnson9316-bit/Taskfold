import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const activeFiles = [
  "openclaw.plugin.json",
  "package.json",
  "src/backend/index.ts",
  "src/backend/api.ts",
  "src/backend/runtime-api.ts",
  "src/backend/doctor-contract-api.ts",
  ...fs
    .readdirSync(path.join(root, "src/backend/src"), { recursive: true })
    .filter((entry) => typeof entry === "string" && entry.endsWith(".ts"))
    .map((entry) => path.join("src/backend/src", entry)),
  ...fs
    .readdirSync(path.join(root, "packages/core/src"), { recursive: true })
    .filter((entry) => typeof entry === "string" && entry.endsWith(".ts"))
    .map((entry) => path.join("packages/core/src", entry)),
];

const violations = [];
for (const relativePath of activeFiles) {
  const contents = fs.readFileSync(path.join(root, relativePath), "utf8");
  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    if (!/\bworkboard\b/i.test(line)) {
      continue;
    }
    // The host's managed-worktree API types `ownerKind` as the literal
    // "workboard" on both worktrees.create() and worktrees.removeIfLossless().
    // That is the host's ownership vocabulary, shared by every plugin that owns
    // worktrees, not a Taskfold public name, and the host's worktreeOwnerMatches()
    // refuses any record whose kind differs -- pass something else and the
    // worktree silently leaks. Exempt that single field assignment wherever it
    // appears rather than listing call sites: the host widened the signature in
    // 2026.9.4, so pinning this to one file only broke the audit the next time a
    // caller had to supply it. Every other occurrence still fails, including tool
    // names, gateway methods, identifiers, and prose in comments.
    const allowedHostCompatibility = /^\s*ownerKind:\s*"workboard",?\s*$/.test(line);
    if (!allowedHostCompatibility) {
      violations.push(`${relativePath}:${index + 1}: ${line.trim()}`);
    }
  }
}

const manifestPath = path.join(root, "openclaw.plugin.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const manifestText = JSON.stringify(manifest);
if (manifest.id !== "taskfold" || manifest.name !== "Taskfold") {
  violations.push("openclaw.plugin.json must expose id taskfold and name Taskfold.");
}
if (!manifestText.includes("taskfold.cards.list") || /\bworkboard[._]/i.test(manifestText)) {
  violations.push("openclaw.plugin.json contains an unmigrated public RPC name.");
}

// TASKFOLD_TOOL_NAMES is the single source of truth for the tool surface. The
// manifest repeats it twice and the implementations a third time, so without this
// check a tool can be advertised without existing, or exist without being
// advertised, and nothing fails until runtime.
const toolNamesSource = fs.readFileSync(
  path.join(root, "src/backend/src/workspace-access.ts"),
  "utf8",
);
const toolNamesBlock = toolNamesSource.match(
  /export const TASKFOLD_TOOL_NAMES = \[([\s\S]*?)\] as const;/,
);
if (!toolNamesBlock) {
  violations.push("workspace-access.ts no longer declares TASKFOLD_TOOL_NAMES as a literal array.");
}
const toolNames = toolNamesBlock ? [...toolNamesBlock[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];

const implemented = new Set(
  ["src/backend/src", "packages/core/src"].flatMap((dir) =>
    fs
      .readdirSync(path.join(root, dir), { recursive: true })
      .filter((entry) => typeof entry === "string" && entry.endsWith(".ts"))
      .flatMap((entry) =>
        [
          ...fs
            .readFileSync(path.join(root, dir, entry), "utf8")
            .matchAll(/^\s*name: "(taskfold_[a-z_]+)",$/gm),
        ].map((m) => m[1]),
      ),
  ),
);

function reportSetDifference(label, expected, actual) {
  const missing = expected.filter((name) => !actual.has(name));
  const extra = [...actual].filter((name) => !expected.includes(name));
  if (missing.length) {
    violations.push(`${label} is missing: ${missing.join(", ")}`);
  }
  if (extra.length) {
    violations.push(`${label} has entries absent from TASKFOLD_TOOL_NAMES: ${extra.join(", ")}`);
  }
}

if (toolNames.length) {
  reportSetDifference("openclaw.plugin.json contracts.tools", toolNames, new Set(manifest.contracts?.tools ?? []));
  reportSetDifference("openclaw.plugin.json toolMetadata", toolNames, new Set(Object.keys(manifest.toolMetadata ?? {})));
  reportSetDifference("the registered tool implementations", toolNames, implemented);
}

if (process.argv.includes("--fix") && toolNames.length) {
  // Textual splice rather than a JSON round-trip: re-serializing the whole
  // manifest would reflow every hand-formatted block in it.
  const original = fs.readFileSync(manifestPath, "utf8");
  const replaceBlock = (text, key, body) => {
    const pattern = new RegExp(`("${key}": )(\\[[\\s\\S]*?\\n {4}\\]|\\{[\\s\\S]*?\\n {2}\\})`);
    if (!pattern.test(text)) {
      throw new Error(`could not locate the ${key} block in openclaw.plugin.json`);
    }
    return text.replace(pattern, `$1${body}`);
  };
  const toolsBody = `[\n${toolNames.map((name) => `      "${name}"`).join(",\n")}\n    ]`;
  const metadataBody = `{\n${toolNames
    .map((name) => `    "${name}": {\n      "optional": true\n    }`)
    .join(",\n")}\n  }`;
  const fixed = replaceBlock(replaceBlock(original, "tools", toolsBody), "toolMetadata", metadataBody);
  JSON.parse(fixed);
  fs.writeFileSync(manifestPath, fixed);
  console.log(`Rewrote openclaw.plugin.json tool surface from ${toolNames.length} source names.`);
  process.exit(0);
}

if (violations.length) {
  console.error("Public name audit failed:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  console.error("Run `npm run check:public-names -- --fix` to rewrite the manifest tool surface.");
  process.exitCode = 1;
} else {
  console.log(
    `Checked ${activeFiles.length} active files and ${toolNames.length} tool names: taskfold public names are isolated and the tool surface agrees.`,
  );
}
