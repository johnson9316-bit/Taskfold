---
id: doc-2
title: TASK-8 host 接口契约（8a 产出，供 8b）
type: other
created_date: '2026-09-24 13:48'
---


# TASK-8 host 接口契约

8a（2026-09-24）产出。定义在 `browser/host.ts:25`，OpenClaw 实现在 `browser/openclaw-host.ts:87`。

## 接口

```ts
type TaskfoldHostEvent = { type: "connection" } | { type: "changes" };
type TaskfoldHostCapabilities = { readonly execution: boolean };
type TaskfoldLocalePreference = { initial(): unknown; persist(locale: "en" | "zh-CN"): void };
interface TaskfoldHost {
  request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
  subscribe(listener: (e: TaskfoldHostEvent) => void): () => void;
  readonly connected: boolean;
  readonly locale: TaskfoldLocalePreference;
  confirm(message: string): Promise<boolean>;
  readonly capabilities: TaskfoldHostCapabilities;
}
bindTaskfoldHost(host: TaskfoldHost, signal?: AbortSignal): () => void;
```

约定：
- `subscribe` 注册时不回调。`connection` 可以重复发，前端收到后自己重读 `connected`。
- 收到 `changes` 时，前端重拉 projects.list 和 projects.get；在资料库页再加 documents.list。
- `confirm` 取消或关闭一律 resolve(false)，不能 reject。
- `request` reject 时，前端直接展示 `Error.message`。
- `locale.initial()` 可以返回任意语言标签，前端会归一成 en / zh-CN。
- `persist` 在语言生效后调用（包括初始化那次），VS Code 可以空实现。
- `taskfold.changes.wait` 只在 OpenClaw 实现内部使用，VS Code 不需要实现。
- 能力开关 `execution=false` 时，隐藏执行区块、启动执行弹窗，以及 5 个执行方法。

## VS Code 首版需要的 method（前端对多数写操作的返回值不读，写完直接全量刷新）

| method | 前端传的参数 | 前端读的返回 | 对应 core |
|---|---|---|---|
| projects.list | includeArchived:true | `{projects}` | listProjects |
| projects.get | id | `{project}` | getProject |
| projects.create | id, name, projectMode, defaultWorkspace? | project.board.id | createProject |
| projects.update | id, name, version, currentObjective, coreValue, sourceOfTruth, repositoryUrl, planningPath, homepageUrl, defaultWorkspace? | 不读 | updateProject |
| projects.archive / restore | id | 不读 | archiveProject(id, bool) |
| projects.reorder | ids | 不读 | reorderProjects |
| projects.boardView.update | id, boardView | 不读 | updateProject({boardView}) |
| milestones.create / update | boardId 或 id, title, description, color | 不读 | createMilestone / updateMilestone |
| milestones.complete / archive / restore | id | 不读 | 同名方法 |
| milestones.reorder | boardId, milestoneIds | 不读 | reorderMilestones |
| documents.list | boardId, includeHidden:true | `{documents}` | listProjectDocuments |
| documents.read | id | `{preview}` | getProjectDocument；读文件在适配层 project-document-reader.ts |
| documents.write | id, content, expectedRevision（字符串） | `{preview}` | markdown 类型调 updateProjectDocument；path 类型的 CAS 与读写都在适配层 |
| documents.create / update | 见 project-host.ts 的 saveDocument | 不读 | createProjectDocument / updateProjectDocument |
| documents.hide / restore / delete | id | 不读 | hideProjectDocument / deleteProjectDocument |
| documents.reorder | boardId, documentIds | 不读 | reorderProjectDocuments |
| cards.create | boardId, title, notes, status, priority, agentId, milestoneId?, requirementId?, kind? | 不读 | create（store-core）；补 defaultWorkspace 在适配层 |
| cards.update | id, delivery{…} | 不读 | update(id, patch, {expectedRevision}) |
| cards.move | id, status | 不读 | move（store-promote） |
| cards.archive | id, archived | 不读 | archive（store-dispatch） |
| cards.moveMilestone | id, milestoneId?, position? | 不读 | moveMilestone |
| cards.moveProject | id, boardId, milestoneId | 不读 | moveProject；跨数据根搬卡在适配层 project-routed-stores.ts |
| cards.requirement.set | id, requirementId? | 不读 | setCardRequirement |
| cards.sources.create / update / delete / reorder | id + label/target/note 或 sourceReferenceId(s) | 不读 | add/update/delete/reorderSourceReference(s) |
| cards.proof / proof.delete | id + status/label/command/url/note，或 proofId | 不读 | addProof / deleteProof |
| cards.artifact / artifact.delete | id + label/url 或 path/mimeType，或 artifactId | 不读 | addArtifact / deleteArtifact |

执行相关的方法可以隐藏：cards.execution.prepare / start / inspect / steer / abort 都在适配层 card-execution.ts；sessions.steer 和 chat.abort 是 OpenClaw 宿主自己的方法。

8b 要在扩展进程里自己实现的适配层逻辑：
- documents.read / write 的文件读写与 revision 计算
- workspace 权限检查
- cards.create 补 defaultWorkspace
- 多项目（多个 workspace folder）的变更聚合

## 🔴 CAS 缺口（8b 必须先补）

前端调用 cards.update、cards.move、cards.moveMilestone 时都不传 `expectedRevision`；move 和 moveMilestone 在网关层也不接收这个参数。要做「冲突三选一」和「拖拽也走 CAS」，得先让前端传读到的 revision，再让 VS Code 的 method 映射把它交给 core 做 CAS。
