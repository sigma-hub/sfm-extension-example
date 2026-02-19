// @ts-check
/**
 * Example Extension for Sigma File Manager
 * 
 * This is a demo extension that demonstrates how to:
 * - Add items to the context menu
 * - Register and execute commands
 * - Show notifications
 * - Show dialogs
 * - Access app context (current path, selected entries)
 * - Execute built-in commands (navigate, open dialogs)
 * - Use configurable settings (via sigma.settings API)
 * - Show progress for long-running operations (via sigma.ui.withProgress)
 */

function getGreetingByStyle(style, name) {
  switch (style) {
    case 'formal':
      return `Good day, ${name}. How may I assist you?`;
    case 'casual':
      return `Hey ${name}! What's up?`;
    case 'friendly':
    default:
      return `Hello, ${name}! Nice to see you!`;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function activate(context) {
  console.log('[Example] Extension activated!');
  console.log('[Example] Extension path:', context.extensionPath);

  const appVersion = await sigma.context.getAppVersion();
  console.log('[Example] App version:', appVersion);

  const settings = await sigma.settings.getAll();
  console.log('[Example] Current settings:', settings);

  sigma.settings.onChange('showNotifications', (newValue, oldValue) => {
    console.log(`[Example] showNotifications changed from ${oldValue} to ${newValue}`);
  });

  sigma.contextMenu.registerItem(
    {
      id: 'say-hello',
      title: 'Say Hello',
      icon: 'Hand',
      group: 'extensions',
      order: 1
    },
    async (menuContext) => {
      const showNotifications = await sigma.settings.get('showNotifications');
      if (!showNotifications) {
        console.log('[Example] Notifications disabled, skipping');
        return;
      }

      const greeting = await sigma.settings.get('greeting');
      const duration = await sigma.settings.get('notificationDuration');
      const style = await sigma.settings.get('greetingStyle');
      const firstName = menuContext.selectedEntries[0]?.name || 'there';
      
      sigma.ui.showNotification({
        title: greeting || 'Hello',
        message: getGreetingByStyle(style, firstName),
        type: 'info',
        duration: duration || 3000
      });
    }
  );

  sigma.contextMenu.registerItem(
    {
      id: 'count-selected',
      title: 'Count Selected Items',
      icon: 'Hash',
      group: 'extensions',
      order: 2,
      when: {
        selectionType: 'multiple'
      }
    },
    async (menuContext) => {
      const count = menuContext.selectedEntries.length;
      const files = menuContext.selectedEntries.filter(e => !e.isDirectory).length;
      const folders = menuContext.selectedEntries.filter(e => e.isDirectory).length;
      
      sigma.ui.showNotification({
        title: 'Selection Count',
        message: `Selected ${count} items: ${files} files, ${folders} folders`,
        type: 'success',
        duration: 4000
      });
    }
  );

  sigma.contextMenu.registerItem(
    {
      id: 'file-info',
      title: 'Show File Details',
      icon: 'Info',
      group: 'extensions',
      order: 3,
      when: {
        selectionType: 'single',
        entryType: 'file'
      }
    },
    async (menuContext) => {
      const file = menuContext.selectedEntries[0];
      
      if (file) {
        const sizeKB = file.size ? (file.size / 1024).toFixed(2) : 'Unknown';
        
        await sigma.ui.showDialog({
          title: 'File Details',
          message: `Name: ${file.name}\nPath: ${file.path}\nExtension: ${file.extension || 'None'}\nSize: ${sizeKB} KB`,
          type: 'info',
          confirmText: 'OK'
        });
      }
    }
  );

  sigma.contextMenu.registerItem(
    {
      id: 'copy-path',
      title: 'Copy Path',
      icon: 'Copy',
      group: 'extensions',
      order: 4,
      when: {
        selectionType: 'single'
      }
    },
    async (menuContext) => {
      const entry = menuContext.selectedEntries[0];
      
      if (entry) {
        await navigator.clipboard.writeText(entry.path);
        
        sigma.ui.showNotification({
          title: 'Path Copied',
          message: `Copied to clipboard: ${entry.path}`,
          type: 'success',
          duration: 2000
        });
      }
    }
  );

  sigma.commands.registerCommand(
    {
      id: 'greet',
      title: 'Greet User',
      description: 'Shows a greeting notification with your name',
      arguments: [
        {
          name: 'name',
          type: 'text',
          placeholder: 'Enter your name',
          required: true,
        },
        {
          name: 'style',
          type: 'dropdown',
          placeholder: 'Greeting style',
          data: [
            { title: 'Friendly', value: 'friendly' },
            { title: 'Formal', value: 'formal' },
            { title: 'Casual', value: 'casual' },
          ],
        },
      ],
    },
    async (args) => {
      const showNotifications = await sigma.settings.get('showNotifications');
      if (!showNotifications) {
        console.log('[Example] Notifications disabled');
        return;
      }

      const greeting = await sigma.settings.get('greeting');
      const duration = await sigma.settings.get('notificationDuration');
      const settingsStyle = await sigma.settings.get('greetingStyle');
      const providedArgs = args && typeof args === 'object' ? args : {};
      const name = providedArgs.name || null;
      const style = providedArgs.style || settingsStyle;

      if (name) {
        sigma.ui.showNotification({
          title: greeting || 'Hello',
          message: getGreetingByStyle(style, name),
          type: 'success',
          duration: duration || 5000
        });
        return;
      }

      const result = await sigma.ui.showDialog({
        title: greeting || 'Hello',
        message: 'What is your name?',
        type: 'prompt',
        defaultValue: 'World',
        confirmText: 'Greet Me',
        cancelText: 'Cancel'
      });

      if (result.confirmed && result.value) {
        sigma.ui.showNotification({
          title: greeting || 'Hello',
          message: getGreetingByStyle(style, result.value),
          type: 'success',
          duration: duration || 5000
        });
      }
    }
  );

  sigma.commands.registerCommand(
    { id: 'show-info', title: 'Show Extension Info' },
    async () => {
      const appVersion = await sigma.context.getAppVersion();
      const duration = await sigma.settings.get('notificationDuration');
      sigma.ui.showNotification({
        title: 'Example Extension',
        message: `Version 1.10.0 - Running on Sigma File Manager v${appVersion}`,
        type: 'info',
        duration: duration || 4000
      });
    }
  );

  sigma.commands.registerCommand(
    { id: 'show-settings', title: 'Show Current Settings', description: 'Displays the current extension settings' },
    async () => {
      const settings = await sigma.settings.getAll();
      const settingsText = Object.entries(settings)
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join('\n');

      await sigma.ui.showDialog({
        title: 'Example Extension Settings',
        message: `Current settings:\n\n${settingsText}\n\nYou can change these in Settings > Extensions.`,
        type: 'info',
        confirmText: 'OK'
      });
    }
  );

  sigma.commands.registerCommand(
    { id: 'show-context', title: 'Show Current Context', description: 'Shows current path and selection info' },
    () => {
      const currentPath = sigma.context.getCurrentPath();
      const selectedEntries = sigma.context.getSelectedEntries();

      const message = selectedEntries.length > 0
        ? `Path: ${currentPath}\nSelected: ${selectedEntries.length} items\nFirst: ${selectedEntries[0].name}`
        : `Path: ${currentPath}\nNo items selected`;

      sigma.ui.showDialog({
        title: 'Current Context',
        message: message,
        type: 'info',
        confirmText: 'OK'
      });
    }
  );

  sigma.commands.registerCommand(
    { id: 'open-file-dialog', title: 'Open File Dialog', description: 'Opens a native file picker' },
    async () => {
      const result = await sigma.dialog.openFile({
        title: 'Select a file',
        filters: [
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (result) {
        sigma.ui.showNotification({
          title: 'File Selected',
          message: `You selected: ${Array.isArray(result) ? result.join(', ') : result}`,
          type: 'success'
        });
      }
    }
  );

  sigma.commands.registerCommand(
    { id: 'list-builtin-commands', title: 'List Built-in Commands', description: 'Shows available built-in commands' },
    async () => {
      const commands = sigma.commands.getBuiltinCommands();
      const commandList = commands.map(cmd => `• ${cmd.id}`).join('\n');

      await sigma.ui.showDialog({
        title: 'Built-in Commands',
        message: `Available commands:\n\n${commandList}`,
        type: 'info',
        confirmText: 'OK'
      });
    }
  );

  sigma.commands.registerCommand(
    { id: 'demo-progress', title: 'Demo Progress API', description: 'Demonstrates the progress notification API' },
    async () => {
      const totalItems = 10;
      let processedItems = 0;
      let wasCancelled = false;

      const result = await sigma.ui.withProgress(
        {
          title: 'Processing Items...',
          location: 'notification',
          cancellable: true
        },
        async (progress, token) => {
          token.onCancellationRequested(() => {
            console.log('[Example] Progress cancelled by user');
            wasCancelled = true;
          });

          for (let itemIndex = 0; itemIndex < totalItems; itemIndex++) {
            if (token.isCancellationRequested) {
              return { completed: false, processed: processedItems };
            }

            progress.report({
              message: `Processing item ${itemIndex + 1} of ${totalItems}`,
              increment: 100 / totalItems
            });

            await sleep(500);
            processedItems++;
          }

          return { completed: true, processed: processedItems };
        }
      );

      if (result.completed) {
        sigma.ui.showNotification({
          title: 'Processing Complete',
          message: `Successfully processed ${result.processed} items!`,
          type: 'success'
        });
      } else {
        sigma.ui.showNotification({
          title: 'Processing Cancelled',
          message: `Processed ${result.processed} of ${totalItems} items before cancellation.`,
          type: 'warning'
        });
      }
    }
  );

  sigma.contextMenu.registerItem(
    {
      id: 'quick-view-file',
      title: 'Quick View',
      icon: 'Eye',
      group: 'extensions',
      order: 5,
      when: {
        selectionType: 'single',
        entryType: 'file'
      }
    },
    async (menuContext) => {
      const file = menuContext.selectedEntries[0];
      if (file) {
        try {
          await sigma.commands.executeCommand('sigma.quickView.open', file.path);
        } catch (err) {
          sigma.ui.showNotification({
            title: 'Quick View Error',
            message: err.message || 'Could not open quick view',
            type: 'error'
          });
        }
      }
    }
  );

  sigma.contextMenu.registerItem(
    {
      id: 'analyze-file-deno',
      title: 'Analyze File with Deno',
      icon: 'FileSearch',
      group: 'extensions',
      order: 6,
      when: {
        selectionType: 'single',
        entryType: 'file'
      }
    },
    async (menuContext) => {
      const file = menuContext.selectedEntries[0];
      if (!file) {
        return;
      }

      const escapedPath = file.path.replace(/\\/g, '\\\\');
      const denoScript = `
        const filePath = "${escapedPath}";
        const data = await Deno.readFile(filePath);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
        const textContent = new TextDecoder().decode(data);
        const lineCount = textContent.split("\\n").length;
        const sizeBytes = data.byteLength;
        console.log(JSON.stringify({ hash: hashHex, lines: lineCount, sizeBytes }));
      `;

      try {
        const result = await sigma.shell.run('deno', ['eval', denoScript]);

        if (result.code !== 0) {
          sigma.ui.showNotification({
            title: 'Analysis Failed',
            message: result.stderr || 'Deno exited with an error',
            type: 'error'
          });
          return;
        }

        const analysis = JSON.parse(result.stdout.trim());
        const sizeFormatted = analysis.sizeBytes < 1024
          ? `${analysis.sizeBytes} B`
          : analysis.sizeBytes < 1048576
            ? `${(analysis.sizeBytes / 1024).toFixed(2)} KB`
            : `${(analysis.sizeBytes / 1048576).toFixed(2)} MB`;

        await sigma.ui.showDialog({
          title: `File Analysis: ${file.name}`,
          message: [
            `SHA-256: ${analysis.hash}`,
            `Lines: ${analysis.lines}`,
            `Size: ${sizeFormatted}`,
          ].join('\n'),
          type: 'info',
          confirmText: 'OK'
        });
      } catch (error) {
        sigma.ui.showNotification({
          title: 'Analysis Error',
          message: error.message || 'Failed to analyze file with Deno',
          type: 'error'
        });
      }
    }
  );

  sigma.commands.registerCommand(
    {
      id: 'deno-eval',
      title: 'Run Deno Eval',
      description: 'Evaluates a JavaScript expression using Deno and shows the result',
      arguments: [
        {
          name: 'expression',
          type: 'text',
          placeholder: 'Enter a JavaScript expression (e.g. 2 + 2)',
          required: true,
        },
      ],
    },
    async (args) => {
      const providedArgs = args && typeof args === 'object' ? args : {};
      const expression = providedArgs.expression;

      if (!expression) {
        sigma.ui.showNotification({
          title: 'Deno Eval',
          message: 'No expression provided',
          type: 'warning'
        });
        return;
      }

      try {
        const result = await sigma.shell.run('deno', ['eval', `console.log(${expression})`]);

        if (result.code !== 0) {
          await sigma.ui.showDialog({
            title: 'Deno Eval - Error',
            message: result.stderr || 'Deno exited with a non-zero code',
            type: 'error',
            confirmText: 'OK'
          });
          return;
        }

        await sigma.ui.showDialog({
          title: 'Deno Eval - Result',
          message: `Expression: ${expression}\n\nOutput:\n${result.stdout.trim()}`,
          type: 'info',
          confirmText: 'OK'
        });
      } catch (error) {
        sigma.ui.showNotification({
          title: 'Deno Eval Error',
          message: error.message || 'Failed to run Deno',
          type: 'error'
        });
      }
    }
  );

  sigma.commands.registerCommand(
    { id: 'deno-system-info', title: 'Show Deno System Info', description: 'Displays system information reported by Deno' },
    async () => {
      try {
        const denoScript = `
          const info = {
            os: Deno.build.os,
            arch: Deno.build.arch,
            denoVersion: Deno.version.deno,
            v8Version: Deno.version.v8,
            typescriptVersion: Deno.version.typescript,
            hostname: Deno.hostname(),
            homeDir: Deno.env.get("HOME") || Deno.env.get("USERPROFILE"),
          };
          console.log(JSON.stringify(info));
        `;

        const result = await sigma.shell.run('deno', ['eval', '--unstable', denoScript]);

        if (result.code !== 0) {
          sigma.ui.showNotification({
            title: 'Deno System Info',
            message: result.stderr || 'Failed to get system info',
            type: 'error'
          });
          return;
        }

        const info = JSON.parse(result.stdout.trim());
        const infoText = [
          `OS: ${info.os}`,
          `Architecture: ${info.arch}`,
          `Deno: v${info.denoVersion}`,
          `V8: v${info.v8Version}`,
          `TypeScript: v${info.typescriptVersion}`,
          `Hostname: ${info.hostname}`,
          `Home: ${info.homeDir}`,
        ].join('\n');

        await sigma.ui.showDialog({
          title: 'Deno System Info',
          message: infoText,
          type: 'info',
          confirmText: 'OK'
        });
      } catch (error) {
        sigma.ui.showNotification({
          title: 'Deno System Info',
          message: error.message || 'Deno is not installed or not in PATH',
          type: 'error'
        });
      }
    }
  );

  console.log('[Example] All handlers registered!');
}

async function deactivate() {
  console.log('[Example] Extension deactivated!');
}

if (typeof module !== 'undefined') {
  module.exports = { activate, deactivate };
}
