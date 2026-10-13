// Taskfold 原生 Control UI 入口。
//
// 对应 `需求/15.9-ControlUI注入调查.md` 第 4 步：挂载 `project-host.ts` 里的真实
// 看板面板（迁移自旧 iframe SPA 的 `ui/src/main.ts` + `ui/src/pages/projects/project-view.ts`），
// 取代此前只做连接层/长轮询验证的骨架。旧 iframe 管线已在第 5 步删除，本文件是
// 唯一的 Control UI 入口。
import { defineControlUiPlugin, type ControlUiHost } from "openclaw/plugin-sdk/control-ui";
import { bindTaskfoldHost, type TaskfoldRoute } from "./host.ts";
import { createOpenClawTaskfoldHost } from "./openclaw-host.ts";
// 副作用导入：注册 <taskfold-app> 自定义元素（见 project-host.ts 末尾的
// `customElements.define`），本文件只负责创建并挂载这个元素。
import "./project-host.ts";

const PLUGIN_ID = "taskfold";
/** 页面参数名：地址里的 `?p.project=<项目 id>`，宿主把 `p.*` 去掉前缀后放进 `props`。 */
const PROJECT_PARAM = "project";

/**
 * 地址与当前项目的同步。宿主把页面参数交给 `mount` / `update` 的 `props`（地址变了会再调
 * `update`），反过来用 `navigation.openPage` 把前端的选择写回地址。
 */
type ReceivingRoute = TaskfoldRoute & { receive(props: Readonly<Record<string, string>>): void };

function createRoute(host: ControlUiHost): ReceivingRoute {
  let projectId: string | undefined;
  const listeners = new Set<() => void>();
  const route: ReceivingRoute = {
    get projectId() {
      return projectId;
    },
    setProject(next) {
      if (next === projectId) {
        return;
      }
      projectId = next;
      host.navigation.openPage({ id: PLUGIN_ID, params: next ? { [PROJECT_PARAM]: next } : {} });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    receive(props) {
      const next = props[PROJECT_PARAM] || undefined;
      if (next === projectId) {
        return;
      }
      projectId = next;
      for (const listener of [...listeners]) {
        listener();
      }
    },
  };
  // 浏览器前进 / 后退：宿主不一定会为同一个页面再调一次 `update`，所以自己读地址。
  const onPopState = () => {
    route.receive({ [PROJECT_PARAM]: new URLSearchParams(window.location.search).get(`p.${PROJECT_PARAM}`) ?? "" });
  };
  window.addEventListener("popstate", onPopState);
  host.signal.addEventListener("abort", () => window.removeEventListener("popstate", onPopState), { once: true });
  return route;
}

export default defineControlUiPlugin({
  id: PLUGIN_ID,
  activate(host: ControlUiHost) {
    const route = createRoute(host);
    const unbindHost = bindTaskfoldHost(createOpenClawTaskfoldHost(host, route), host.signal);
    const disposePage = host.ui.registerPage({
      id: PLUGIN_ID,
      label: "Taskfold",
      mount(container, context) {
        // 必须在创建 <taskfold-app> 之前收下地址参数：它的 connectedCallback 会读 route.projectId。
        route.receive(context.props);
        const app = document.createElement("taskfold-app");
        container.append(app);
        return {
          update(next) {
            route.receive(next.props);
          },
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
