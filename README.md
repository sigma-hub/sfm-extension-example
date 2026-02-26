# Example Extension

A practical demo extension for [Sigma File Manager](https://github.com/aleksey-hoffman/sigma-file-manager) that showcases a consistent extension API style.

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

## Script-Based Demos

The extension ships reusable scripts in `scripts/` and executes them with `deno run`:

- `scripts/json-tools.js`
- `scripts/file-analysis.js`
- `scripts/runtime-info.js`

This avoids dynamic `eval` and keeps command execution patterns consistent.

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

- Sigma File Manager `>=2.0.0`
- Deno installed and available in `PATH` for Deno-based examples
- Windows for PowerShell-specific examples
