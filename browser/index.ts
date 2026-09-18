// Taskfold 原生 Control UI 入口。
//
// 对应 `需求/15.9-ControlUI注入调查.md` 第 4 步：挂载 `project-host.ts` 里的真实
// 看板面板（迁移自 `ui/src/main.ts` + `ui/src/pages/projects/project-view.ts`），
// 取代此前只做连接层/长轮询验证的骨架。与 `ui/src/main.ts`（iframe SPA，经 Vite
// 构建到 `ui/dist/`）完全独立、互不影响：第 5 步清理旧管线之前，两条路径并存。
import { defineControlUiPlugin, type ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { bindTaskfoldHost } from "./host.ts";
// 副作用导入：注册 <taskfold-app> 自定义元素（见 project-host.ts 末尾的
// `customElements.define`），本文件只负责创建并挂载这个元素。
import "./project-host.ts";

const PLUGIN_ID = "taskfold";

export default defineControlUiPlugin({
  id: PLUGIN_ID,
  activate(host: ControlUiHost) {
    const unbindHost = bindTaskfoldHost(host);
    const disposePage = host.ui.registerPage({
      id: PLUGIN_ID,
      label: "Taskfold",
      mount(container) {
        const app = document.createElement("taskfold-app");
        container.append(app);
        return {
          dispose() {
            app.remove();
          },
        };
      },
    });
    return () => {
      disposePage();
      unbindHost();
    };
  },
});
