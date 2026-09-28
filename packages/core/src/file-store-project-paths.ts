import path from "node:path";
import type { TaskfoldCard, TaskfoldProjectDocument } from "./contract/index.js";
import type { TaskfoldCardCodec } from "./file-store-codec.js";

/** `.taskfold/` 中的 `./` 路径以项目主 checkout 为根；旧绝对路径仍按原值读取。 */
export function projectPath(root: string, value: string, direction: "read" | "write"): string {
  if (direction === "read") {
    if (!value.startsWith("./")) return value;
    const resolved = path.resolve(root, value);
    const relative = path.relative(root, resolved);
    if (relative === ".." || relative.startsWith(`..${path.sep}`)) {
      throw new Error("project-relative path escapes the project root.");
    }
    return resolved;
  }
  if (!path.isAbsolute(value)) return value;
  const relative = path.relative(root, value);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`)
    ? `./${relative.split(path.sep).join("/")}`
    : value;
}

export function mapCardProjectPaths(root: string, card: TaskfoldCard, direction: "read" | "write"): TaskfoldCard {
  const references = card.sourceReferences?.map((reference) => ({
    ...reference,
    target: projectPath(root, reference.target, direction),
  }));
  const automation = card.metadata?.automation;
  const workspace = automation?.workspace;
  return {
    ...card,
    ...(references ? { sourceReferences: references } : {}),
    ...(workspace ? {
      metadata: {
        ...card.metadata,
        automation: {
          ...automation,
          workspace: {
            ...workspace,
            ...(workspace.path ? { path: projectPath(root, workspace.path, direction) } : {}),
            ...(workspace.sourcePath ? { sourcePath: projectPath(root, workspace.sourcePath, direction) } : {}),
          },
        },
      },
    } : {}),
  };
}

export function mapDocumentProjectPath(
  root: string,
  document: TaskfoldProjectDocument,
  direction: "read" | "write",
): TaskfoldProjectDocument {
  return document.type === "path" && document.target
    ? { ...document, target: projectPath(root, document.target, direction) }
    : document;
}

export function withProjectPaths(codec: TaskfoldCardCodec, root: string): TaskfoldCardCodec {
  return {
    parse: (content) => mapCardProjectPaths(root, codec.parse(content), "read"),
    serialize: (card, previousContent, displayIdHint) =>
      codec.serialize(mapCardProjectPaths(root, card, "write"), previousContent, displayIdHint),
  };
}
