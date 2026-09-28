import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { createTaskfoldFileStores } from "@taskfold/core/file-store.js";
import { projectPath } from "@taskfold/core/file-store-project-paths.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

it("仓库内路径写为 ./，读回当前项目的绝对路径；旧仓库外绝对路径保持原值", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskfold-paths-"));
  roots.push(root);
  const stores = createTaskfoldFileStores({ dataDir: path.join(root, ".taskfold") });
  const file = path.join(root, "docs", "spec.md");
  const card = {
    id: "card-paths",
    title: "Relative paths",
    status: "todo" as const,
    priority: "normal" as const,
    labels: [],
    position: 1000,
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    sourceReferences: [{ id: "ref", label: "spec", target: file, position: 1, createdAt: 1, updatedAt: 1 }],
    metadata: { automation: { boardId: "default", workspace: { kind: "dir" as const, path: root } } },
  };
  await stores.cards.register(card.id, { version: 1, card });
  const saved = fs.readFileSync(path.join(root, ".taskfold", "cards", fs.readdirSync(path.join(root, ".taskfold", "cards"))[0]!), "utf8");
  expect(saved).toContain('"target": "./docs/spec.md"');
  expect(saved).toContain('"path": "./"');
  expect((await stores.cards.lookup(card.id))?.card.sourceReferences?.[0]?.target).toBe(file);
  expect((await stores.cards.lookup(card.id))?.card.metadata?.automation?.workspace?.path).toBe(root);

  const document = {
    id: "doc", boardId: "default", key: "spec", section: "project" as const,
    source: "project" as const, type: "path" as const, title: "Spec", target: file,
    position: 1000, system: false, createdAt: 1, updatedAt: 1,
  };
  await stores.documents.register(document.id, { version: 1, document });
  expect(JSON.parse(fs.readFileSync(path.join(root, ".taskfold", "documents", "spec.json"), "utf8")).target).toBe("./docs/spec.md");
  expect((await stores.documents.lookup(document.id))?.document.target).toBe(file);
  expect(projectPath(root, "/some/old/external.md", "read")).toBe("/some/old/external.md");
  expect(() => projectPath(root, "./../outside.md", "read")).toThrow("escapes");
});
