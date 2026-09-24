// Taskfold 适配层：Gateway 启动时检查 SQLite 旧数据是否已迁移（TASK-10）。
//
// 生产存储已切到文件（project-routed-stores.ts）。`<pluginDir>/taskfold.sqlite` 还在、而
// `<pluginDir>/projects.json` 还没有，说明这台机器上的旧数据还没迁过来——此时看板是空的。只打一条
// WARN 提示迁移命令，不自动迁移（迁移会往各项目仓库里写 `.taskfold/`，要人确认）。
// 单独一个模块：不引 node:sqlite，Gateway 常驻路径不加载 SQLite。
import fs from "node:fs";
import path from "node:path";
import type { OpenClawPluginService } from "../api.js";

export function createTaskfoldSqliteMigrationCheckService(pluginDir: string): OpenClawPluginService {
  return {
    id: "taskfold-sqlite-migration-check",
    start(ctx) {
      const sqlitePath = path.join(pluginDir, "taskfold.sqlite");
      const projectsJsonPath = path.join(pluginDir, "projects.json");
      if (fs.existsSync(sqlitePath) && !fs.existsSync(projectsJsonPath)) {
        ctx.logger.warn(
          `taskfold: ${sqlitePath} exists but ${projectsJsonPath} does not: Taskfold now stores data in files ` +
            `and your SQLite data has not been migrated yet. Run "openclaw taskfold migrate-sqlite --dry-run" ` +
            `to preview, then "openclaw taskfold migrate-sqlite --apply".`,
        );
      }
    },
  };
}
