# Example Extension

A simple demo extension for [Sigma File Manager](https://github.com/aleksey-hoffman/sigma-file-manager) that demonstrates the extension API.

## Features

- **Context Menu Items**
  - 👋 Say Hello - Shows a greeting notification
  - 📊 Count Selected Items - Counts files and folders (when multiple items selected)
  - ℹ️ Show File Details - Displays file information (when single file selected)

- **Commands**
  - Greet User - Prompts for your name and greets you
  - Show Extension Info - Displays extension information

## Installation

1. Open Sigma File Manager
2. Navigate to **Extensions** in the sidebar
3. Search for "Example"
4. Click **Install**

## Development

### Prerequisites

- Sigma File Manager v2.0.0 or later

### Setup

1. Clone this repository
2. The extension is written in plain JavaScript and requires no build step
3. For TypeScript support, download the type definitions:
   ```bash
   curl -O https://raw.githubusercontent.com/aleksey-hoffman/sigma-file-manager/v2/src/modules/extensions/sdk/sigma-extension.d.ts
   ```

### Project Structure

```
sfm-extension-example/
├── manifest.json    # Extension metadata and configuration
├── index.js         # Main extension code
├── icon.png         # Extension icon (128x128)
└── README.md        # This file
```

### API Used

This extension demonstrates:

- `sigma.contextMenu.registerItem()` - Adding items to the context menu
- `sigma.commands.registerCommand()` - Registering executable commands
- `sigma.ui.showNotification()` - Displaying notifications
- `sigma.ui.showDialog()` - Showing dialog boxes

## License

MIT License

## Author

Aleksey Hoffman ([@aleksey-hoffman](https://github.com/aleksey-hoffman))
