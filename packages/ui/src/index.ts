// Taskfold 原生 Control UI 入口。
//
// 对应 `需求/15.9-ControlUI注入调查.md` 第 4 步：挂载 `project-host.ts` 里的真实
// 看板面板（迁移自旧 iframe SPA 的 `ui/src/main.ts` + `ui/src/pages/projects/project-view.ts`），
// 取代此前只做连接层/长轮询验证的骨架。旧 iframe 管线已在第 5 步删除，本文件是
// 唯一的 Control UI 入口。
import { defineControlUiPlugin, type ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { bindTaskfoldHost } from "./host.ts";
import { createOpenClawTaskfoldHost } from "./openclaw-host.ts";
// 副作用导入：注册 <taskfold-app> 自定义元素（见 project-host.ts 末尾的
// `customElements.define`），本文件只负责创建并挂载这个元素。
import "./project-host.ts";

const PLUGIN_ID = "taskfold";

export default defineControlUiPlugin({
  id: PLUGIN_ID,
  activate(host: ControlUiHost) {
    const unbindHost = bindTaskfoldHost(createOpenClawTaskfoldHost(host), host.signal);
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
