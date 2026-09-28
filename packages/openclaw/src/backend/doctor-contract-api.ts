// 已下线（TASK-10 第二段，2026-09-28）：`.28 plugin-state KV → SQLite` doctor 迁移随 SQLite
// 运行时后端一起移除。理由：数据真相源已是文件存储（`.taskfold/*.md`），该迁移原先的写入目标
// `createTaskfoldSqliteStores` 已删除，迁移没有落点；`openclaw.plugin.json` 的 `doctorContract`
// 声明与 `build:backend` 的入口、`pack-check` 的产物清单也已一并去掉，宿主不会再加载本模块。
//
// TODO(清理，待用户执行)：本文件与 `dist/doctor-contract-api.js` 应删除——
//   2026-09-28 本机对这两个文件的删除操作被审批流阻断（多次超时），内容先保留为空模块占位。
export {};
