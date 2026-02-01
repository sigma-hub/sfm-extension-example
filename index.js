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
    { id: 'greet', title: 'Greet User' },
    async () => {
      const showNotifications = await sigma.settings.get('showNotifications');
      if (!showNotifications) {
        console.log('[Example] Notifications disabled');
        return;
      }

      const greeting = await sigma.settings.get('greeting');
      const duration = await sigma.settings.get('notificationDuration');
      const style = await sigma.settings.get('greetingStyle');

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

  console.log('[Example] All handlers registered!');
}

async function deactivate() {
  console.log('[Example] Extension deactivated!');
}

if (typeof module !== 'undefined') {
  module.exports = { activate, deactivate };
}
