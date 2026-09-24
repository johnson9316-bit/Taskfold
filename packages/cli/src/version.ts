/**
 * CLI 版本号。`--version`、`taskfold instructions` 的标题、注入 AGENTS.md / CLAUDE.md 的标记块
 * （`<!-- TASKFOLD GUIDELINES START v<版本> -->`）都用它，三者始终一致。
 * 必须与 packages/cli/package.json 的 `version` 相同（test/cli-guidelines.test.ts 校验）。
 */
export const TASKFOLD_CLI_VERSION = "0.2.0";

/**
 * `--json` 输出契约的版本，即每个 JSON 对象里的 `schemaVersion`。只描述 CLI 输出的形状，
 * 与 `.taskfold/config.yml` 的 `format_version`（磁盘数据格式，归 core 管）是两回事：
 * 输出形状有不兼容改动时才 +1，数据格式升级不影响它。
 */
export const TASKFOLD_CLI_SCHEMA_VERSION = 1;
