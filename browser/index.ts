// Taskfold 原生 Control UI 入口骨架。
//
// 对应 `需求/15.9-ControlUI注入调查.md`「建议的实施拆分」第 3 步：只搭一个最小骨架，
// 用来验证宿主原生注入契约与自建构建管线（不依赖 `openclaw plugins build`）这两件事，
// 不在这一步迁移 `ui/src/` 下的真实面板逻辑（那是第 4 步）。
//
// 与现有 `ui/src/main.ts`（iframe SPA，经 Vite 构建到 `ui/dist/`）完全独立、互不影响：
// 那条管线在原生注入被实机验证通过之前仍是唯一可用的 UI，本文件不导入、不复用它的任何模块。
import { defineControlUiPlugin, type ControlUiHost } from "openclaw/plugin-sdk/control-ui";

const PLUGIN_ID = "taskfold";

/** `taskfold.cards.list` 响应体里本骨架关心的最小子集，完整形状见 `src/backend/src/gateway-helpers.ts`。 */
interface TaskfoldCardsListResult {
  cards?: readonly unknown[];
}

/**
 * 渲染最小页面：一行标题证明"这是 Taskfold 面板"，一行状态文字证明
 * `host.request()` 数据通道可用（而不是还在用旧的自建 WebSocket）。
 */
function renderSkeletonPage(container: HTMLElement, host: ControlUiHost): () => void {
  const root = document.createElement("div");
  root.style.padding = "16px";
  root.style.fontFamily = "system-ui, sans-serif";

  const title = document.createElement("h1");
  title.style.fontSize = "18px";
  title.style.margin = "0 0 8px";
  title.textContent = "Taskfold（原生注入骨架）";

  const status = document.createElement("p");
  status.style.margin = "0";
  status.style.color = "#666";
  status.textContent = "正在通过 host.request() 拉取卡片数量……";

  root.append(title, status);
  container.append(root);

  let disposed = false;
  host
    .request<TaskfoldCardsListResult>("taskfold.cards.list", {})
    .then((result) => {
      if (disposed) {
        return;
      }
      const count = Array.isArray(result?.cards) ? result.cards.length : 0;
      status.textContent = `数据通道已连通：当前共有 ${count} 张卡片。`;
    })
    .catch((error: unknown) => {
      if (disposed) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      status.textContent = `数据通道调用失败：${message}`;
    });

  return () => {
    disposed = true;
    root.remove();
  };
}

export default defineControlUiPlugin({
  id: PLUGIN_ID,
  activate(host: ControlUiHost) {
    return host.ui.registerPage({
      id: PLUGIN_ID,
      label: "Taskfold",
      mount(container) {
        const dispose = renderSkeletonPage(container, host);
        return { dispose };
      },
    });
  },
});
