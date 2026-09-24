import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // VS Code 扩展的单测用最小的 vscode API 替身（运行时没有真正的 `vscode` 模块）。
    alias: {
      vscode: fileURLToPath(new URL("./test/helpers/vscode-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/tpm/**"],
  },
});
