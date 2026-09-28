# Taskfold for VS Code

A kanban board for the Taskfold cards stored in a repository's `.taskfold/` directory. The board
opens in the editor area and reuses the same board UI as the OpenClaw Control UI panel. The
extension embeds `@taskfold/core`, so no OpenClaw, Gateway or `~/.openclaw` is needed, and it
takes the same cross-process locks and revision checks as the `taskfold` CLI.

## Install

Build the `.vsix` from the repository root (Node.js `>=24.16.0`):

```bash
npm install
npm run package -w packages/vscode
code --install-extension packages/vscode/taskfold-0.2.0.vsix
```

The `.vsix` is self-contained: core and its dependencies are bundled into `dist/extension.js`,
and the board UI into `media/`. After installing it you can delete or move the repository checkout.
Requires VS Code 1.100 or newer.

After updating the UI or extension code, rebuild and reinstall the `.vsix`, then run
**Developer: Reload Window**. Building the workspace alone does not update an installed extension.

## Use

Click **Taskfold** in the Activity Bar, then **Open Board** in the sidebar.
You can also run **Taskfold: Open Board** from the Command Palette.

- **Projects**: every workspace folder where a `.taskfold/` directory can be found is one project,
  named after the folder. `.taskfold/` is located the same way as the CLI does it: inside a git
  worktree the folder is mapped to the main checkout first, and the search goes up to the
  repository root. A folder whose cards sit on several boards is shown as one project per board.
- **No `.taskfold/` yet**: the board shows an empty state. Run `taskfold init` in the repository;
  the board picks it up automatically.
- **Editing**: drag cards between columns, change status or milestone, and use **Edit card** in
  the card details to change the title, priority and body. **Open in editor** opens the card's
  Markdown file in a normal VS Code editor.
- **Documents**: browse, create, edit, reorder, hide and delete project documents. Markdown
  files can be previewed and edited when they are inside the project checkout; saving checks
  the document revision and rejects an outdated draft.
- **Language** follows VS Code's display language (English or Simplified Chinese).

## Conflicts

Every card write from the board is a compare-and-swap on the revision the board last read,
including drag and drop. If the card changed since (for example the CLI or an agent wrote to it),
a dialog offers:

- **Reload**: discard your changes and show the latest card.
- **Overwrite**: apply your changes on top of the latest version.
- **View Diff**: compare the card on disk with your version, then choose again.

Closing the dialog writes nothing and keeps your edit open. If another process holds the card's
lock for about 2 seconds, the write fails with a "try again" message and nothing is written.

The board refreshes when files under `.taskfold/` change, and rereads everything every 30 seconds
while it is visible.

## Not in this version

Starting or steering executions, creating / archiving / reordering projects, project settings,
moving cards between projects are hidden in VS Code. The board view
settings (group by / sort) are remembered per workspace.

WSL drvfs paths (`/mnt/c/...`) and `\\wsl$` paths are not supported (see the CLI README).
