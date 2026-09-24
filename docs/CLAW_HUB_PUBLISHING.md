# Publishing Taskfold to ClawHub

This document records the release workflow for the official OpenClaw package
registry, ClawHub. It is intentionally written in English because the package
metadata, GitHub repository, and public release surface are English-first.

Publishing to the ClawHub registry creates a community package. It does not
self-designate the package as an OpenClaw first-party or "official channel"
package; that channel is controlled by the OpenClaw maintainers.

## Package Identity

| Field | Value |
| --- | --- |
| ClawHub package | `@johnson9316-bit/taskfold` |
| OpenClaw runtime ID | `taskfold` |
| GitHub repository | `johnson9316-bit/Taskfold` |
| Package family | `code-plugin` |
| Distribution artifact | npm pack tarball |

Use the scoped `@johnson9316-bit/taskfold` identity for every publication and
installation command.

## Monorepo Layout

The repository is an npm workspaces monorepo. The package that ClawHub
publishes is `packages/openclaw`, not the repository root. All `npm`/`npx
clawhub` commands below either run from the repository root and target
`packages/openclaw` explicitly, or run from inside `packages/openclaw`
itself — the two are noted per command. When passing the package directory
as a positional argument from the repository root, always prefix it with
`./` (`./packages/openclaw`), never bare (`packages/openclaw`): npm's own
pack-spec resolver reads an unprefixed `a/b`-shaped path as a
`<user>/<repo>` GitHub shorthand before it checks whether that path exists
on disk, so a bare `packages/openclaw` gets misread as a GitHub install spec
and fails with a git error instead of packing the local directory.

`packages/openclaw/package.json`'s `files` whitelist includes five files
that live only at the repository root (`README.md`, `LICENSE`,
`THIRD-PARTY-NOTICES`, `UPSTREAM.md`, `docs/CLAW_HUB_PUBLISHING.md` — this
file). npm's `files` field cannot reach outside the package directory with
`../`, so there is exactly one source copy of each at the repository root,
and `packages/openclaw/scripts/release-files.mjs` copies them into
`packages/openclaw/` right before packing and removes the copies right
after. Run this explicitly — do not rely on npm's `prepack`/`postpack`
lifecycle hooks to do it implicitly. The ClawHub CLI's `package publish` and
`package validate` commands both pack a local folder by shelling out to
`npm pack <dir> --json --ignore-scripts`, and `--ignore-scripts` skips
`prepack`/`postpack` entirely, so a hook-only implementation silently
produces a ClawPack missing those five files:

```bash
npm run prepare-release-files   # copy the 5 root files into packages/openclaw/
# ... npm pack / clawhub package validate / clawhub package publish ...
npm run clean-release-files     # remove the copies again
```

`npm run pack:check` (see below) manages this copy/clean itself and does
not need `prepare-release-files` run first; it exists for the two ClawHub
CLI commands and for a manual `npm pack`/`npm publish`, which do not.

This monorepo layout is also why the README no longer documents a `git:`
install path: OpenClaw's `openclaw plugins install git:<repo>` clones the
repository root and treats that root as the plugin directory, with no way
to point it at a subdirectory, so it cannot install `packages/openclaw`
directly — ClawHub/npm is the only supported install channel now.

## Release Preconditions

1. Work from a clean commit on `main`.
2. Bump the version in `packages/openclaw/package.json`'s `version` field
   and its matching entries in the root `package-lock.json`. This is the
   only version number ClawHub publishes: the root `package.json` is
   `"private": true` and has no `version` field, and the other workspace
   packages (`packages/core`, `packages/cli`, `packages/ui`,
   `packages/vscode`) each carry their own independent version and are not
   part of the ClawHub release train. They currently share the same value
   as `packages/openclaw` by historical convention (all split out of one
   `0.2.0` package), not because anything enforces it — do not bump them as
   part of a ClawHub release unless you are releasing them too.
3. Build the checked-in runtime artifacts: `npm run build` (repository
   root; builds `packages/openclaw/dist/`, which is committed to git).
4. Run the repository checks (repository root):

```bash
npm run typecheck
npm test
npm run build
npm run check:public-names
npm run pack:check
```

5. Sync the release files and run the ClawHub static validation against the
   package directory (repository root):

```bash
npm run prepare-release-files
npx clawhub package validate ./packages/openclaw --json
npm run clean-release-files
```

6. Run the real-Gateway checks (see Runtime Capture Note below for why
   these, not `clawhub package validate --runtime`, are the release gate):

```bash
openclaw plugins inspect taskfold --runtime
openclaw plugins doctor
```

`openclaw.compat.pluginApi` and `openclaw.build.openclawVersion` in
`packages/openclaw/package.json` must reflect the OpenClaw plugin API used
for the release.

### Runtime Capture Note

ClawHub CLI `0.23.1`'s optional `package validate --runtime --allow-execute`
currently fails while mocking `resolveStateDir` for Taskfold's OpenClaw
`2026.7.1-2` compatibility layer. The static ClawHub validation reports zero
issues, and the real-Gateway `plugins inspect --runtime` plus `plugins doctor`
checks above are the release gate until that upstream mock incompatibility is
resolved. Do not treat a clean static report as a substitute for the real
Gateway checks.

## First Manual Release

The first release establishes package ownership and source provenance. Start
an interactive device login in a visible browser:

```bash
npx clawhub login
npx clawhub whoami
```

Sync the release files, then publish the current Git commit from the
repository root, pointing at the package directory:

```bash
npm run prepare-release-files
npx clawhub package publish ./packages/openclaw \
  --family code-plugin \
  --name @johnson9316-bit/taskfold \
  --display-name Taskfold \
  --version <version> \
  --changelog "<release notes>" \
  --categories productivity \
  --topics openclaw,kanban,project-management,milestones,worktree \
  --source-repo johnson9316-bit/Taskfold \
  --source-commit "$(git rev-parse HEAD)" \
  --source-ref "v<version>"
npm run clean-release-files
```

Create and push the matching annotated tag before publishing:

```bash
git tag -a "v<version>" -m "Taskfold v<version>"
git push origin main "v<version>"
```

After publication, verify both the registry package and the install path:

```bash
npx clawhub package inspect @johnson9316-bit/taskfold
npx clawhub package readiness @johnson9316-bit/taskfold
openclaw plugins install clawhub:@johnson9316-bit/taskfold
openclaw plugins inspect taskfold --runtime
openclaw plugins doctor
```

## Trusted Publishing

After the first manual release, configure ClawHub trusted publishing to bind
future releases to this GitHub repository and its release workflow. The
publisher account must be authenticated when running this command:

```bash
npx clawhub package trusted-publisher set \
  @johnson9316-bit/taskfold \
  --repository johnson9316-bit/Taskfold \
  --workflow-filename package-publish.yml
```

Use the current ClawHub workflow template from the registry documentation when
adding `.github/workflows/package-publish.yml`. Grant `contents: read` and
`id-token: write`; do not add a long-lived ClawHub or npm token to GitHub
Secrets for the trusted-publisher workflow.

For manually dispatched workflow runs, OpenID Connect can publish without a
stored token. Tag-triggered publishing may require the release policy
supported by the current ClawHub workflow template, so validate the workflow
in a manual dispatch before making tag pushes the release trigger.

## Release Checklist

1. Review the complete diff and confirm no local state, database, `.env`, or
   credential is included.
2. Run all checks from the Release Preconditions section.
3. Commit the release and push `main`.
4. Create and push the version tag.
5. `npm run prepare-release-files`, publish, `npm run clean-release-files`,
   then inspect the ClawHub package and scan result.
6. Install the published artifact into a clean OpenClaw profile and run
   `plugins inspect` plus `plugins doctor`.
7. Record the package version, source commit, ClawHub scan result, and any
   compatibility range changes in the GitHub release notes.

## Incident Handling

- If validation fails, fix the package metadata or code and publish a new
  version. Published artifacts are immutable.
- If a release is published from the wrong source commit, do not overwrite it;
  deprecate or delete the affected release through ClawHub moderation and
  publish a corrected version.
- If the package needs to move to another publisher, use the ClawHub package
  transfer command rather than changing the npm scope locally.
- If a token is ever exposed, revoke it through ClawHub immediately, rotate
  any affected GitHub credentials, and publish only after the source has been
  reviewed.
