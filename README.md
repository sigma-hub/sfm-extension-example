# Example Extension

A practical demo extension for [Sigma File Manager](https://github.com/aleksey-hoffman/sigma-file-manager) that showcases a consistent extension API style.

## Structure

- `index.js`: extension entrypoint; activates extension and registers all handlers
- `scripts/`: reusable scripts executed with `deno run` (json-tools.js, file-analysis.js, runtime-info.js)
- `sigma-extension.d.ts`: Sigma API type definitions for editor autocomplete

## Features

### Context Menu Examples

- `Example Notification` - notification from context selection
- `Count Selected Items` - counts files and directories
- `Show File Details` - displays selected file metadata in a modal
- `Copy Path` - copies selected entry path to clipboard
- `Analyze File with Deno` - runs bundled Deno script for hash/line-count/size with PowerShell fallback on Windows

### Command Examples

- `Show Current Context` - shows current path and selected entries
- `Show Current Settings` - displays extension settings in read-only form
- `Open File Dialog` - demonstrates native file picker
- `Demo Progress API` - cancellable progress workflow
- `Run Deno JSON Tools` - validate/pretty/minify JSON via bundled script (with Windows PowerShell fallback)
- `Show Runtime Diagnostics` - runtime info plus PowerShell process diagnostics on Windows

## API Surface Demonstrated

- `sigma.contextMenu.registerItem()`
- `sigma.commands.registerCommand()`
- `sigma.context.getCurrentPath()`
- `sigma.context.getSelectedEntries()`
- `sigma.settings.getAll()` and `sigma.settings.onChange()`
- `sigma.ui.showNotification()`
- `sigma.ui.showDialog()`
- `sigma.ui.createModal()`
- `sigma.ui.withProgress()`
- `sigma.dialog.openFile()`
- `sigma.shell.run()` and `sigma.shell.runWithProgress()`

## Requirements

- Deno installed and available in `PATH` for Deno-based examples
- Windows for PowerShell-specific examples
