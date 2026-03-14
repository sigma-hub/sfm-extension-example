// @ts-check

/**
 * @typedef {import('@sigma-file-manager/api').ExtensionActivationContext} ExtensionActivationContext
 */

let settingsChangeDisposable = null;

const extensionMessages = {
  fileAnalysisTitle: 'File analysis: {fileName}',
  sha256Hash: 'SHA-256 Hash',
  runningCommand: 'Running {command}...',
  analyzingWith: 'Analyzing with {command}...',
  exampleNotification: 'Example notification',
  extensionNotification: 'Extension notification',
  actionFromContextMenu: 'Action triggered from context menu',
  countSelectedItems: 'Count selected items',
  selectionCount: 'Selection count',
  selectedItemsSummary: 'Selected {count} items: {files} files, {folders} folders',
  showFileDetails: 'Show file details',
  fileDetailsTitle: 'File details: {fileName}',
  name: 'Name',
  path: 'Path',
  extension: 'Extension',
  size: 'Size',
  none: 'None',
  copyPath: 'Copy path',
  pathCopied: 'Path copied',
  copiedToClipboard: 'Copied to clipboard',
  analyzeFileDeno: 'Analyze file with Deno',
  analyzingFile: 'Analyzing {fileName}',
  preparingAnalysis: 'Preparing analysis...',
  analysisCancelled: 'Analysis cancelled',
  stoppedAnalyzing: 'Stopped analyzing {fileName}',
  analysisFailed: 'Analysis failed',
  analysisError: 'Analysis error',
  failedAnalyzeFile: 'Failed to analyze file',
  showSettings: 'Show current settings',
  showSettingsDesc: 'Displays the current extension settings',
  extensionSettings: 'Extension settings',
  currentConfigNote: 'Current configuration for this extension. You can change these in Settings > Extensions.',
  showContext: 'Show current context',
  showContextDesc: 'Shows current path and selection info',
  currentPath: 'Current Path',
  selectedItems: 'Selected Items',
  notAvailable: 'N/A',
  currentContext: 'Current context',
  directory: 'Directory',
  file: 'File',
  moreEntriesNotShown: '{count} more selected {entries} not shown',
  oneEntry: 'entry',
  nEntries: 'entries',
  openFileDialog: 'Open file dialog',
  openFileDialogDesc: 'Opens a native file picker',
  selectFile: 'Select a file',
  fileSelected: 'File selected',
  youSelected: 'You selected',
  demoProgress: 'Demo progress API',
  demoProgressDesc: 'Demonstrates the progress notification API',
  processing: 'Processing',
  processed: 'Processed',
  itemNOfTotal: 'Item {n} of {total}',
  nItems: '{n} items',
  processingCancelled: 'Processing cancelled',
  processedBeforeCancel: 'Processed {processed} of {total} items before cancellation.',
  denoJsonTools: 'Deno JSON tools',
  denoJsonToolsDesc: 'Validates, formats, or minifies JSON using a bundled Deno script',
  action: 'Action',
  validateJson: 'Validate JSON',
  prettyPrint: 'Pretty Print',
  minify: 'Minify',
  json: 'JSON',
  result: 'Result',
  run: 'Run',
  jsonInputRequired: 'JSON input is required.',
  noRuntimeFound: 'No supported runtime found. Install Deno or use Windows PowerShell.',
  runtimeDiagnostics: 'Show runtime diagnostics',
  runtimeDiagnosticsDesc: 'Displays runtime system info and includes PowerShell process diagnostics on Windows',
  collectingSystemInfo: 'Collecting system info',
  preparingRuntime: 'Preparing runtime...',
  systemInfoCancelled: 'System info cancelled',
  stoppedCollecting: 'Stopped collecting system info',
  systemInfo: 'System info',
  failedSystemInfo: 'Failed to get system info',
  runtime: 'Runtime',
  os: 'OS',
  arch: 'Architecture',
  hostname: 'Hostname',
  home: 'Home',
  osName: 'OS Name',
  osVersion: 'OS Version',
  powerShellDiagnostics: 'PowerShell Process Diagnostics',
  runningProcesses: 'Running Processes',
  topCpuProcesses: 'Top CPU Processes',
  noProcessData: 'No process data returned.',
  diagnosticsUnavailable: 'PowerShell process diagnostics are unavailable.',
};

function formatMessage(template, params) {
  if (!params) {
    return template;
  }

  return String(template).replace(/\{(\w+)\}/g, (fullMatch, paramKey) => {
    return Object.prototype.hasOwnProperty.call(params, paramKey)
      ? String(params[paramKey])
      : fullMatch;
  });
}

function getT() {
  return (key, params) => {
    const translated = sigma.i18n.extensionT(key, params);
    return translated === `extensions.sigma.hello-world.${key}`
      ? formatMessage(extensionMessages[key] ?? key, params)
      : translated;
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getErrorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error);
}

function isCommandNotFoundError(error) {
  const errorMessage = getErrorMessage(error).toLowerCase();
  return (
    errorMessage.includes('not found')
    || errorMessage.includes('does not exist')
    || errorMessage.includes('cannot find')
  );
}

function formatFileSize(sizeBytes) {
  if (sizeBytes == null) return 'Unknown';
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1048576) return `${(sizeBytes / 1024).toFixed(2)} KB`;
  return `${(sizeBytes / 1048576).toFixed(2)} MB`;
}

function showFileAnalysisModal(fileName, hashValue) {
  const t = getT();
  sigma.ui.createModal({
    title: t('fileAnalysisTitle', { fileName }),
    width: 760,
    content: [
      sigma.ui.input({
        id: 'fileHash',
        label: t('sha256Hash'),
        value: hashValue,
        disabled: true,
      }),
    ],
  });
}

function escapeForPowerShellSingleQuotes(text) {
  return String(text).replace(/'/g, "''");
}

function getWindowsPowerShellCandidates(script) {
  return [
    { command: 'powershell', args: ['-NoProfile', '-Command', script] },
    { command: 'pwsh', args: ['-NoProfile', '-Command', script] },
    { command: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', args: ['-NoProfile', '-Command', script] },
  ];
}

async function runPowerShellScript(script, options = {}) {
  if (!sigma.platform.isWindows) {
    throw new Error('PowerShell script execution is only supported on Windows.');
  }

  const timeout = typeof options.timeout === 'number' && options.timeout > 0
    ? options.timeout
    : 10000;
  const parseOutput = typeof options.parseOutput === 'function'
    ? options.parseOutput
    : ({ stdout }) => stdout;
  const commandCandidates = getWindowsPowerShellCandidates(script);
  let latestError = null;

  for (const commandCandidate of commandCandidates) {
    let timeoutHandle = null;
    let timedOut = false;
    let abortSignalListener = null;
    let runningCommand = null;

    try {
      runningCommand = await sigma.shell.runWithProgress(
        commandCandidate.command,
        commandCandidate.args,
        () => {},
      );

      if (timeout > 0) {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          if (runningCommand) {
            runningCommand.cancel().catch(() => {});
          }
        }, timeout);
      }

      if (options.signal) {
        abortSignalListener = () => {
          if (runningCommand) {
            runningCommand.cancel().catch(() => {});
          }
        };

        if (options.signal.aborted) {
          abortSignalListener();
        } else {
          options.signal.addEventListener('abort', abortSignalListener, { once: true });
        }
      }

      const result = await runningCommand.result;
      const commandText = `${commandCandidate.command} ${commandCandidate.args.join(' ')}`;
      const executionError = result.code === 0
        ? undefined
        : new Error(result.stderr || `${commandCandidate.command} exited with code ${result.code}`);

      if (result.code !== 0) {
        throw executionError;
      }

      return parseOutput({
        stdout: result.stdout,
        stderr: result.stderr,
        error: executionError,
        exitCode: result.code,
        signal: null,
        timedOut,
        command: commandText,
      });
    } catch (error) {
      latestError = error;
      if (isCommandNotFoundError(error)) {
        continue;
      }
      throw error;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      if (options.signal && abortSignalListener) {
        options.signal.removeEventListener('abort', abortSignalListener);
      }
    }
  }

  throw latestError || new Error('No available PowerShell command candidates');
}

async function runFirstAvailableCommand(commandCandidates) {
  let latestError = null;

  for (const commandCandidate of commandCandidates) {
    try {
      const result = await sigma.shell.run(commandCandidate.command, commandCandidate.args);
      return { result, commandName: commandCandidate.command };
    } catch (error) {
      latestError = error;
      if (isCommandNotFoundError(error)) {
        continue;
      }
      throw error;
    }
  }

  throw latestError || new Error('No available command candidates');
}

async function getDenoCommandCandidates(denoArgs) {
  const commandCandidates = [];
  const addedCommands = new Set();

  try {
    const denoBinaryPath = await sigma.binary.getPath('deno');
    if (denoBinaryPath && !addedCommands.has(denoBinaryPath)) {
      commandCandidates.push({ command: denoBinaryPath, args: denoArgs });
      addedCommands.add(denoBinaryPath);
    }
  } catch {
  }

  if (!addedCommands.has('deno')) {
    commandCandidates.push({ command: 'deno', args: denoArgs });
  }

  return commandCandidates;
}

async function runFirstAvailableCommandWithProgress(commandCandidates, progress, cancellationToken) {
  let latestError = null;
  let progressValue = 8;

  for (const commandCandidate of commandCandidates) {
    if (cancellationToken.isCancellationRequested) {
      return { cancelled: true };
    }

    try {
      const t = getT();
      progress.report({
        description: t('runningCommand', { command: commandCandidate.command }),
        increment: progressValue,
      });
      progressValue = 0;

      const runningCommand = await sigma.shell.runWithProgress(
        commandCandidate.command,
        commandCandidate.args,
        () => {
          if (!cancellationToken.isCancellationRequested) {
            progress.report({
              description: t('analyzingWith', { command: commandCandidate.command }),
              increment: 0.4,
            });
          }
        },
      );

      const cancellationListener = cancellationToken.onCancellationRequested(() => {
        runningCommand.cancel().catch(() => {});
      });

      try {
        const result = await runningCommand.result;
        return {
          cancelled: false,
          result,
          commandName: commandCandidate.command,
        };
      } finally {
        cancellationListener.dispose();
      }
    } catch (error) {
      latestError = error;

      if (cancellationToken.isCancellationRequested) {
        return { cancelled: true };
      }

      if (isCommandNotFoundError(error)) {
        continue;
      }

      throw error;
    }
  }

  throw latestError || new Error('No available command candidates');
}

async function registerContextMenuHandlers(context) {
  const t = getT();
  const fileAnalysisScriptPath = await sigma.platform.joinPath(context.extensionPath, 'scripts', 'file-analysis.js');

  sigma.contextMenu.registerItem(
    {
      id: 'example-notification',
      title: t('exampleNotification'),
      icon: 'Bell',
      group: 'extensions',
      order: 1
    },
    async (menuContext) => {
      const showNotifications = await sigma.settings.get('showNotifications');
      if (!showNotifications) {
        console.log('[Example] Notifications disabled, skipping');
        return;
      }

      const duration = await sigma.settings.get('notificationDuration');
      const entry = menuContext.selectedEntries[0];

      sigma.ui.showNotification({
        title: t('extensionNotification'),
        subtitle: t('actionFromContextMenu'),
        description: entry ? entry.name : '',
        type: 'info',
        duration: duration || 3000
      });
    }
  );

  sigma.contextMenu.registerItem(
    {
      id: 'count-selected',
      title: t('countSelectedItems'),
      icon: 'Hash',
      group: 'extensions',
      order: 2,
      when: {
        selectionType: 'multiple'
      }
    },
    async (menuContext) => {
      const count = menuContext.selectedEntries.length;
      const files = menuContext.selectedEntries.filter(entry => !entry.isDirectory).length;
      const folders = menuContext.selectedEntries.filter(entry => entry.isDirectory).length;

      sigma.ui.showNotification({
        title: t('selectionCount'),
        subtitle: t('selectedItemsSummary', { count, files, folders }),
        type: 'success',
        duration: 4000
      });
    }
  );

  sigma.contextMenu.registerItem(
    {
      id: 'file-info',
      title: t('showFileDetails'),
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
      if (!file) return;

      sigma.ui.createModal({
        title: t('fileDetailsTitle', { fileName: file.name }),
        width: 640,
        content: [
          sigma.ui.input({ id: 'name', label: t('name'), value: file.name, disabled: true }),
          sigma.ui.input({ id: 'path', label: t('path'), value: file.path, disabled: true }),
          sigma.ui.input({ id: 'extension', label: t('extension'), value: file.extension || t('none'), disabled: true }),
          sigma.ui.input({ id: 'size', label: t('size'), value: formatFileSize(file.size), disabled: true }),
        ],
      });
    }
  );

  sigma.contextMenu.registerItem(
    {
      id: 'copy-path',
      title: t('copyPath'),
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
        await sigma.ui.copyText(entry.path);

        sigma.ui.showNotification({
          title: t('pathCopied'),
          subtitle: t('copiedToClipboard'),
          description: entry.path,
          type: 'success',
          duration: 2000
        });
      }
    }
  );

  sigma.contextMenu.registerItem(
    {
      id: 'analyze-file-deno',
      title: t('analyzeFileDeno'),
      icon: 'FileSearch',
      group: 'extensions',
      order: 5,
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

      const powerShellPath = escapeForPowerShellSingleQuotes(file.path);
      const powerShellScript = `$targetPath = '${powerShellPath}'; $hash = (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash.ToLower(); [PSCustomObject]@{ hash = $hash } | ConvertTo-Json -Compress`;

      try {
        const fallbackCandidates = sigma.platform.isWindows
          ? getWindowsPowerShellCandidates(powerShellScript)
          : [];
        const analysisExecution = await sigma.ui.withProgress(
          {
            subtitle: t('analyzingFile', { fileName: file.name }),
            location: 'notification',
            cancellable: true,
          },
          async (progress, cancellationToken) => {
            progress.report({
              description: t('preparingAnalysis'),
              increment: 6,
            });

            try {
              const executionResult = await runFirstAvailableCommandWithProgress(
                [
                  ...(await getDenoCommandCandidates(['run', '--quiet', '--allow-read', fileAnalysisScriptPath, file.path])),
                  ...fallbackCandidates,
                ],
                progress,
                cancellationToken,
              );
              return executionResult;
            } catch (error) {
              if (cancellationToken.isCancellationRequested) {
                return { cancelled: true };
              }
              throw error;
            }
          },
        );

        if (analysisExecution.cancelled) {
          sigma.ui.showNotification({
            title: t('analysisCancelled'),
            subtitle: t('stoppedAnalyzing', { fileName: file.name }),
            type: 'warning'
          });
          return;
        }

        const { result, commandName } = analysisExecution;

        if (result.code !== 0) {
          sigma.ui.showNotification({
            title: t('analysisFailed'),
            subtitle: result.stderr || `${commandName} exited with an error`,
            type: 'error'
          });
          return;
        }

        const analysis = JSON.parse(result.stdout.trim());
        showFileAnalysisModal(file.name, analysis.hash);
      } catch (error) {
        sigma.ui.showNotification({
          title: t('analysisError'),
          subtitle: getErrorMessage(error) || t('failedAnalyzeFile'),
          type: 'error'
        });
      }
    }
  );
}

async function registerCommands(context) {
  const t = getT();
  const jsonToolsScriptPath = await sigma.platform.joinPath(context.extensionPath, 'scripts', 'json-tools.js');
  const runtimeInfoScriptPath = await sigma.platform.joinPath(context.extensionPath, 'scripts', 'runtime-info.js');

  sigma.commands.registerCommand(
    { id: 'show-settings', title: t('showSettings'), description: t('showSettingsDesc') },
    async () => {
      const allSettings = await sigma.settings.getAll();
      const settingsContent = [];

      for (const [key, value] of Object.entries(allSettings)) {
        settingsContent.push(
          sigma.ui.input({
            id: key,
            label: key,
            value: String(value),
            disabled: true,
          })
        );
      }

      sigma.ui.createModal({
        title: t('extensionSettings'),
        width: 640,
        content: [
          sigma.ui.text(t('currentConfigNote')),
          sigma.ui.separator(),
          ...settingsContent,
        ],
      });
    }
  );

  sigma.commands.registerCommand(
    { id: 'show-context', title: t('showContext'), description: t('showContextDesc') },
    async () => {
      const currentPath = await sigma.context.getCurrentPath();
      const selectedEntries = await sigma.context.getSelectedEntries();

      const content = [
        sigma.ui.input({ id: 'currentPath', label: t('currentPath'), value: currentPath || t('notAvailable'), disabled: true }),
        sigma.ui.separator(),
        sigma.ui.input({ id: 'selectedCount', label: t('selectedItems'), value: String(selectedEntries.length), disabled: true }),
      ];

      if (selectedEntries.length > 0) {
        content.push(sigma.ui.separator());
        const maxDisplay = Math.min(selectedEntries.length, 2);
        for (let entryIndex = 0; entryIndex < maxDisplay; entryIndex++) {
          const entry = selectedEntries[entryIndex];
          const entryTypeLabel = entry.isDirectory ? t('directory') : t('file');
          content.push(
            sigma.ui.input({
              id: `entry-${entryIndex}`,
              label: entryTypeLabel,
              value: entry.path,
              disabled: true,
            })
          );
        }
        if (selectedEntries.length > maxDisplay) {
          const hiddenEntriesCount = selectedEntries.length - maxDisplay;
          const hiddenEntriesLabel = hiddenEntriesCount === 1 ? t('oneEntry') : t('nEntries');
          content.push(sigma.ui.text(t('moreEntriesNotShown', { count: hiddenEntriesCount, entries: hiddenEntriesLabel })));
        }
      }

      sigma.ui.createModal({
        title: t('currentContext'),
        width: 720,
        content,
      });
    }
  );

  sigma.commands.registerCommand(
    { id: 'open-file-dialog', title: t('openFileDialog'), description: t('openFileDialogDesc') },
    async () => {
      const result = await sigma.dialog.openFile({
        title: t('selectFile'),
        filters: [
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (result) {
        sigma.ui.showNotification({
          title: t('fileSelected'),
          subtitle: t('youSelected'),
          description: Array.isArray(result) ? result.join(', ') : result,
          type: 'success'
        });
      }
    }
  );

  sigma.commands.registerCommand(
    { id: 'demo-progress', title: t('demoProgress'), description: t('demoProgressDesc') },
    async () => {
      const totalItems = 10;
      let processedItems = 0;

      const result = await sigma.ui.withProgress(
        {
          subtitle: t('processing'),
          location: 'notification',
          cancellable: true
        },
        async (progress, token) => {
          token.onCancellationRequested(() => {
            console.log('[Example] Progress cancelled by user');
          });

          for (let itemIndex = 0; itemIndex < totalItems; itemIndex++) {
            if (token.isCancellationRequested) {
              return { completed: false, processed: processedItems };
            }

            progress.report({
              description: t('itemNOfTotal', { n: itemIndex + 1, total: totalItems }),
              increment: 100 / totalItems
            });

            await sleep(500);
            processedItems++;
          }

          progress.report({
            subtitle: t('processed'),
            description: t('nItems', { n: processedItems }),
            increment: 100,
          });

          return { completed: true, processed: processedItems };
        }
      );

      if (!result.completed) {
        sigma.ui.showNotification({
          title: t('processingCancelled'),
          subtitle: t('processedBeforeCancel', { processed: result.processed, total: totalItems }),
          type: 'warning'
        });
      }
    }
  );

  sigma.commands.registerCommand(
    {
      id: 'deno-json-tools',
      title: t('denoJsonTools'),
      description: t('denoJsonToolsDesc'),
    },
    async () => {
      return new Promise((resolve) => {
        const modal = sigma.ui.createModal({
          title: t('denoJsonTools'),
          width: 720,
          content: [
            sigma.ui.select({
              id: 'action',
              label: t('action'),
              options: [
                { value: 'validate', label: t('validateJson') },
                { value: 'pretty', label: t('prettyPrint') },
                { value: 'minify', label: t('minify') },
              ],
              value: 'validate',
            }),
            sigma.ui.textarea({
              id: 'jsonInput',
              label: t('json'),
              placeholder: '{\n  "name": "Sigma"\n}',
              rows: 10,
            }),
            sigma.ui.textarea({
              id: 'resultOutput',
              label: t('result'),
              value: '',
              rows: 8,
              disabled: true,
            }),
          ],
          buttons: [
            { id: 'run', label: t('run'), variant: 'primary', shortcut: { key: 'Enter', modifiers: ['ctrl'] } },
          ],
        });

        modal.onSubmit(async (values, buttonId) => {
          if (buttonId !== 'run') return false;

          const action = typeof values.action === 'string' ? values.action : 'validate';
          const jsonInput = typeof values.jsonInput === 'string' ? values.jsonInput.trim() : '';

          if (!jsonInput) {
            modal.updateElement('resultOutput', {
              value: t('jsonInputRequired'),
            });
            return false;
          }

          try {
            const escapedJsonInput = escapeForPowerShellSingleQuotes(jsonInput);
            const escapedAction = escapeForPowerShellSingleQuotes(action);
            const powerShellJsonToolsScript = `$jsonInput = '${escapedJsonInput}'; $action = '${escapedAction}'; try { $parsed = $jsonInput | ConvertFrom-Json; switch ($action) { 'validate' { $output = 'JSON is valid.' } 'pretty' { $output = $parsed | ConvertTo-Json -Depth 100 } 'minify' { $output = ($parsed | ConvertTo-Json -Depth 100 -Compress) } default { throw "Unsupported action: $action" } }; [PSCustomObject]@{ output = [string]$output } | ConvertTo-Json -Compress } catch { Write-Error $_.Exception.Message; exit 1 }`;
            const fallbackCandidates = sigma.platform.isWindows
              ? getWindowsPowerShellCandidates(powerShellJsonToolsScript)
              : [];
            const denoCommandCandidates = await getDenoCommandCandidates(['run', '--quiet', jsonToolsScriptPath, action, jsonInput]);
            const { result, commandName } = await runFirstAvailableCommand([
              ...denoCommandCandidates,
              ...fallbackCandidates,
            ]);

            if (result.code !== 0) {
              modal.updateElement('resultOutput', {
                value: result.stderr || `${commandName} exited with a non-zero code`,
              });
              return false;
            }

            const parsedResult = JSON.parse(result.stdout.trim());
            modal.updateElement('resultOutput', {
              value: parsedResult.output,
            });
          } catch (error) {
            modal.updateElement('resultOutput', {
              value: getErrorMessage(error) || t('noRuntimeFound'),
            });
          }

          return false;
        });

        modal.onClose(() => resolve());
      });
    }
  );

  sigma.commands.registerCommand(
    { id: 'runtime-diagnostics', title: t('runtimeDiagnostics'), description: t('runtimeDiagnosticsDesc') },
    async () => {
      try {
        const powerShellSystemInfoScript = `$computerInfo = Get-ComputerInfo; $osName = if ($computerInfo.OsName) { $computerInfo.OsName } else { 'Windows' }; $osVersion = if ($computerInfo.OsVersion) { $computerInfo.OsVersion } else { '' }; $hostName = $env:COMPUTERNAME; $homePath = $env:USERPROFILE; [PSCustomObject]@{ os = 'windows'; arch = $env:PROCESSOR_ARCHITECTURE; denoVersion = ''; v8Version = ''; typescriptVersion = ''; hostname = $hostName; homeDir = $homePath; osName = $osName; osVersion = $osVersion } | ConvertTo-Json -Compress`;
        const fallbackCandidates = sigma.platform.isWindows
          ? getWindowsPowerShellCandidates(powerShellSystemInfoScript)
          : [];
        const systemInfoExecution = await sigma.ui.withProgress(
          {
            subtitle: t('collectingSystemInfo'),
            location: 'notification',
            cancellable: true,
          },
          async (progress, cancellationToken) => {
            progress.report({
              description: t('preparingRuntime'),
              increment: 6,
            });

            try {
              const denoCommandCandidates = await getDenoCommandCandidates([
                'run',
                '--quiet',
                '--allow-env',
                '--allow-sys',
                runtimeInfoScriptPath,
              ]);
              const executionResult = await runFirstAvailableCommandWithProgress(
                [
                  ...denoCommandCandidates,
                  ...fallbackCandidates,
                ],
                progress,
                cancellationToken,
              );
              return executionResult;
            } catch (error) {
              if (cancellationToken.isCancellationRequested) {
                return { cancelled: true };
              }
              throw error;
            }
          },
        );

        if (systemInfoExecution.cancelled) {
          sigma.ui.showNotification({
            title: t('systemInfoCancelled'),
            subtitle: t('stoppedCollecting'),
            type: 'warning'
          });
          return;
        }

        const { result, commandName } = systemInfoExecution;

        if (result.code !== 0) {
          sigma.ui.showNotification({
            title: t('systemInfo'),
            subtitle: result.stderr || `${commandName} failed to get system info`,
            type: 'error'
          });
          return;
        }

        const info = JSON.parse(result.stdout.trim());
        const runtimeLabel = commandName === 'deno' ? 'Deno' : 'PowerShell';
        let processDiagnostics = null;
        let processDiagnosticsErrorMessage = null;

        if (sigma.platform.isWindows) {
          try {
            processDiagnostics = await runPowerShellScript(
              '$topProcesses = Get-Process | Sort-Object CPU -Descending | Select-Object -First 5 ProcessName, Id, CPU; [PSCustomObject]@{ processCount = (Get-Process).Count; topProcesses = $topProcesses } | ConvertTo-Json -Compress',
              {
                timeout: 15000,
                parseOutput: ({ stdout }) => JSON.parse(stdout),
              },
            );
          } catch (error) {
            processDiagnosticsErrorMessage = getErrorMessage(error) || 'PowerShell process diagnostics are unavailable.';
          }
        }

        const infoContent = [
          sigma.ui.input({ id: 'runtime', label: t('runtime'), value: runtimeLabel, disabled: true }),
          sigma.ui.input({ id: 'os', label: t('os'), value: info.os, disabled: true }),
          sigma.ui.input({ id: 'arch', label: t('arch'), value: info.arch, disabled: true }),
          sigma.ui.separator(),
          sigma.ui.input({ id: 'deno', label: 'Deno', value: info.denoVersion ? `v${info.denoVersion}` : t('notAvailable'), disabled: true }),
          sigma.ui.input({ id: 'v8', label: 'V8', value: info.v8Version ? `v${info.v8Version}` : t('notAvailable'), disabled: true }),
          sigma.ui.input({ id: 'typescript', label: 'TypeScript', value: info.typescriptVersion ? `v${info.typescriptVersion}` : t('notAvailable'), disabled: true }),
          sigma.ui.separator(),
          sigma.ui.input({ id: 'hostname', label: t('hostname'), value: info.hostname, disabled: true }),
          sigma.ui.input({ id: 'home', label: t('home'), value: info.homeDir, disabled: true }),
        ];

        if (info.osName) {
          infoContent.push(sigma.ui.input({ id: 'osName', label: t('osName'), value: info.osName, disabled: true }));
        }
        if (info.osVersion) {
          infoContent.push(sigma.ui.input({ id: 'osVersion', label: t('osVersion'), value: info.osVersion, disabled: true }));
        }
        if (sigma.platform.isWindows) {
          infoContent.push(sigma.ui.separator());
          infoContent.push(sigma.ui.text(t('powerShellDiagnostics')));
          if (processDiagnostics) {
            const topProcesses = Array.isArray(processDiagnostics.topProcesses)
              ? processDiagnostics.topProcesses
              : processDiagnostics.topProcesses
                ? [processDiagnostics.topProcesses]
                : [];
            const topProcessesText = topProcesses
              .map(processItem => `${processItem.ProcessName} (PID ${processItem.Id}) CPU ${Number(processItem.CPU || 0).toFixed(2)}`)
              .join('\n');

            infoContent.push(
              sigma.ui.input({
                id: 'processCount',
                label: t('runningProcesses'),
                value: String(processDiagnostics.processCount || 0),
                disabled: true,
              })
            );
            infoContent.push(
              sigma.ui.textarea({
                id: 'topProcesses',
                label: t('topCpuProcesses'),
                value: topProcessesText || t('noProcessData'),
                rows: 8,
                disabled: true,
              })
            );
          } else {
            infoContent.push(
              sigma.ui.text(processDiagnosticsErrorMessage || t('diagnosticsUnavailable'))
            );
          }
        }

        sigma.ui.createModal({
          title: t('systemInfo'),
          width: 720,
          content: infoContent,
        });
      } catch (error) {
        sigma.ui.showNotification({
          title: t('systemInfo'),
          subtitle: getErrorMessage(error) || t('failedSystemInfo'),
          type: 'error'
        });
      }
    }
  );
}

export async function activate(context) {
  await sigma.i18n.mergeFromPath('locales');

  console.log('[Example] Extension activated!');
  console.log('[Example] Extension path:', context.extensionPath);

  const appVersion = await sigma.context.getAppVersion();
  console.log('[Example] App version:', appVersion);

  const settings = await sigma.settings.getAll();
  console.log('[Example] Current settings:', settings);

  settingsChangeDisposable = sigma.settings.onChange('showNotifications', (newValue, oldValue) => {
    console.log(`[Example] showNotifications changed from ${oldValue} to ${newValue}`);
  });

  await registerContextMenuHandlers(context);
  await registerCommands(context);

  console.log('[Example] All handlers registered!');
}

export async function deactivate() {
  if (settingsChangeDisposable) {
    settingsChangeDisposable.dispose();
    settingsChangeDisposable = null;
  }
}
