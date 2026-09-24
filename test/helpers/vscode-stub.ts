// 最小的 `vscode` API 替身，只覆盖 packages/vscode/src 用到的部分（vitest.config.ts 把 `vscode`
// 别名到这里）。调用都记在 vi.fn() 上，测试里 `import * as vscode from "vscode"` 拿到同一个对象，
// 用 mockResolvedValueOnce 等设定用户的选择。
import { vi } from "vitest";

export class Uri {
  private constructor(
    readonly scheme: string,
    readonly path: string,
    readonly query: string,
  ) {}

  get fsPath(): string {
    return this.path;
  }

  static file(filePath: string): Uri {
    return new Uri("file", filePath, "");
  }

  static from(components: { scheme: string; path?: string; query?: string }): Uri {
    return new Uri(components.scheme, components.path ?? "", components.query ?? "");
  }

  static joinPath(base: Uri, ...segments: string[]): Uri {
    return new Uri(base.scheme, [base.path, ...segments].join("/"), "");
  }

  toString(): string {
    return `${this.scheme}://${this.path}${this.query ? `?${this.query}` : ""}`;
  }
}

export const window = {
  showWarningMessage: vi.fn(async (..._args: unknown[]): Promise<string | undefined> => undefined),
  showTextDocument: vi.fn(async (..._args: unknown[]) => undefined),
};

export const commands = {
  executeCommand: vi.fn(async (..._args: unknown[]) => undefined),
};

export const workspace = {
  workspaceFolders: [] as unknown[],
};

export const env = { language: "en" };

export enum ViewColumn {
  Active = -1,
}
