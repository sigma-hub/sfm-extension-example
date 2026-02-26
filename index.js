// @ts-check

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

function formatFileSize(sizeBytes) {
  if (sizeBytes == null) return 'Unknown';
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1048576) return `${(sizeBytes / 1024).toFixed(2)} KB`;
  return `${(sizeBytes / 1048576).toFixed(2)} MB`;
}

function showFileAnalysisModal(fileName, hashValue, lineCount, sizeText) {
  sigma.ui.createModal({
    title: `File analysis: ${fileName}`,
    width: 760,
    content: [
      sigma.ui.input({
        id: 'lineCount',
        label: 'Lines',
        value: String(lineCount),
        disabled: true,
      }),
      sigma.ui.input({
        id: 'fileSize',
        label: 'Size',
        value: sizeText,
        disabled: true,
      }),
      sigma.ui.input({
        id: 'fileHash',
        label: 'SHA-256 Hash',
        value: hashValue,
        disabled: true,
      }),
    ],
  });
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
      progress.report({
        description: `Running ${commandCandidate.command}...`,
        increment: progressValue,
      });
      progressValue = 0;

      const runningCommand = await sigma.shell.runWithProgress(
        commandCandidate.command,
        commandCandidate.args,
        () => {
          if (!cancellationToken.isCancellationRequested) {
            progress.report({
              description: `Analyzing with ${commandCandidate.command}...`,
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

async function activate(context) {
  console.log('[Example] Extension activated!');
  console.log('[Example] Extension path:', context.extensionPath);

  const appVersion = await sigma.context.getAppVersion();
  console.log('[Example] App version:', appVersion);

  const settings = await sigma.settings.getAll();
  console.log('[Example] Current settings:', settings);
  const jsonToolsScriptPath = sigma.platform.joinPath(context.extensionPath, 'scripts', 'json-tools.js');
  const fileAnalysisScriptPath = sigma.platform.joinPath(context.extensionPath, 'scripts', 'file-analysis.js');
  const runtimeInfoScriptPath = sigma.platform.joinPath(context.extensionPath, 'scripts', 'runtime-info.js');

  sigma.settings.onChange('showNotifications', (newValue, oldValue) => {
    console.log(`[Example] showNotifications changed from ${oldValue} to ${newValue}`);
  });

  sigma.contextMenu.registerItem(
    {
      id: 'example-notification',
      title: 'Example notification',
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
        title: 'Extension notification',
        subtitle: 'Action triggered from context menu',
        description: entry ? entry.name : '',
        type: 'info',
        duration: duration || 3000
      });
    }
  );

  sigma.contextMenu.registerItem(
    {
      id: 'count-selected',
      title: 'Count selected items',
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
        title: 'Selection count',
        subtitle: `Selected ${count} items: ${files} files, ${folders} folders`,
        type: 'success',
        duration: 4000
      });
    }
  );

  sigma.contextMenu.registerItem(
    {
      id: 'file-info',
      title: 'Show file details',
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
        title: `File details: ${file.name}`,
        width: 640,
        content: [
          sigma.ui.input({ id: 'name', label: 'Name', value: file.name, disabled: true }),
          sigma.ui.input({ id: 'path', label: 'Path', value: file.path, disabled: true }),
          sigma.ui.input({ id: 'extension', label: 'Extension', value: file.extension || 'None', disabled: true }),
          sigma.ui.input({ id: 'size', label: 'Size', value: formatFileSize(file.size), disabled: true }),
        ],
      });
    }
  );

  sigma.contextMenu.registerItem(
    {
      id: 'copy-path',
      title: 'Copy path',
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
          title: 'Path copied',
          subtitle: 'Copied to clipboard',
          description: entry.path,
          type: 'success',
          duration: 2000
        });
      }
    }
  );

  sigma.commands.registerCommand(
    { id: 'show-settings', title: 'Show current settings', description: 'Displays the current extension settings' },
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
        title: 'Extension settings',
        width: 640,
        content: [
          sigma.ui.text('Current configuration for this extension. You can change these in Settings > Extensions.'),
          sigma.ui.separator(),
          ...settingsContent,
        ],
      });
    }
  );

  sigma.commands.registerCommand(
    { id: 'show-context', title: 'Show current context', description: 'Shows current path and selection info' },
    () => {
      const currentPath = sigma.context.getCurrentPath();
      const selectedEntries = sigma.context.getSelectedEntries();

      const content = [
        sigma.ui.input({ id: 'currentPath', label: 'Current Path', value: currentPath || 'N/A', disabled: true }),
        sigma.ui.separator(),
        sigma.ui.input({ id: 'selectedCount', label: 'Selected Items', value: String(selectedEntries.length), disabled: true }),
      ];

      if (selectedEntries.length > 0) {
        content.push(sigma.ui.separator());
        const maxDisplay = Math.min(selectedEntries.length, 2);
        for (let entryIndex = 0; entryIndex < maxDisplay; entryIndex++) {
          const entry = selectedEntries[entryIndex];
          const entryTypeLabel = entry.isDirectory ? 'Directory' : 'File';
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
          const hiddenEntriesLabel = hiddenEntriesCount === 1 ? 'entry' : 'entries';
          content.push(sigma.ui.text(`${hiddenEntriesCount} more selected ${hiddenEntriesLabel} not shown`));
        }
      }

      sigma.ui.createModal({
        title: 'Current context',
        width: 720,
        content,
      });
    }
  );

  sigma.commands.registerCommand(
    { id: 'open-file-dialog', title: 'Open file dialog', description: 'Opens a native file picker' },
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
          title: 'File selected',
          subtitle: 'You selected',
          description: Array.isArray(result) ? result.join(', ') : result,
          type: 'success'
        });
      }
    }
  );

  sigma.commands.registerCommand(
    { id: 'demo-progress', title: 'Demo progress API', description: 'Demonstrates the progress notification API' },
    async () => {
      const totalItems = 10;
      let processedItems = 0;

      const result = await sigma.ui.withProgress(
        {
          subtitle: 'Processing',
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
              description: `Item ${itemIndex + 1} of ${totalItems}`,
              increment: 100 / totalItems
            });

            await sleep(500);
            processedItems++;
          }

          progress.report({
            subtitle: 'Processed',
            description: `${processedItems} items`,
            increment: 100,
          });

          return { completed: true, processed: processedItems };
        }
      );

      if (!result.completed) {
        sigma.ui.showNotification({
          title: 'Processing cancelled',
          subtitle: `Processed ${result.processed} of ${totalItems} items before cancellation.`,
          type: 'warning'
        });
      }
    }
  );

  sigma.contextMenu.registerItem(
    {
      id: 'analyze-file-deno',
      title: 'Analyze file with Deno',
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
      const powerShellScript = `$targetPath = '${powerShellPath}'; $hash = (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash.ToLower(); $lineCount = (Get-Content -LiteralPath $targetPath | Measure-Object -Line).Lines; $sizeBytes = (Get-Item -LiteralPath $targetPath).Length; [PSCustomObject]@{ hash = $hash; lines = [int]$lineCount; sizeBytes = [int64]$sizeBytes } | ConvertTo-Json -Compress`;

      try {
        const fallbackCandidates = sigma.platform.isWindows
          ? getWindowsPowerShellCandidates(powerShellScript)
          : [];
        const analysisExecution = await sigma.ui.withProgress(
          {
            subtitle: `Analyzing ${file.name}`,
            location: 'notification',
            cancellable: true,
          },
          async (progress, cancellationToken) => {
            progress.report({
              description: 'Preparing analysis...',
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
            title: 'Analysis cancelled',
            subtitle: `Stopped analyzing ${file.name}`,
            type: 'warning'
          });
          return;
        }

        const { result, commandName } = analysisExecution;

        if (result.code !== 0) {
          sigma.ui.showNotification({
            title: 'Analysis failed',
            subtitle: result.stderr || `${commandName} exited with an error`,
            type: 'error'
          });
          return;
        }

        const analysis = JSON.parse(result.stdout.trim());
        showFileAnalysisModal(file.name, analysis.hash, analysis.lines, formatFileSize(analysis.sizeBytes));
      } catch (error) {
        sigma.ui.showNotification({
          title: 'Analysis error',
          subtitle: getErrorMessage(error) || 'Failed to analyze file',
          type: 'error'
        });
      }
    }
  );

  sigma.commands.registerCommand(
    {
      id: 'deno-json-tools',
      title: 'Run Deno JSON tools',
      description: 'Validates, formats, or minifies JSON using a bundled Deno script',
    },
    async () => {
      return new Promise((resolve) => {
        const modal = sigma.ui.createModal({
          title: 'Deno JSON tools',
          width: 720,
          content: [
            sigma.ui.select({
              id: 'action',
              label: 'Action',
              options: [
                { value: 'validate', label: 'Validate JSON' },
                { value: 'pretty', label: 'Pretty Print' },
                { value: 'minify', label: 'Minify' },
              ],
              value: 'validate',
            }),
            sigma.ui.textarea({
              id: 'jsonInput',
              label: 'JSON',
              placeholder: '{\n  "name": "Sigma"\n}',
              rows: 10,
            }),
            sigma.ui.textarea({
              id: 'resultOutput',
              label: 'Result',
              value: '',
              rows: 8,
              disabled: true,
            }),
          ],
          buttons: [
            { id: 'run', label: 'Run', variant: 'primary', shortcut: { key: 'Enter', modifiers: ['ctrl'] } },
          ],
        });

        modal.onSubmit(async (values, buttonId) => {
          if (buttonId !== 'run') return false;

          const action = typeof values.action === 'string' ? values.action : 'validate';
          const jsonInput = typeof values.jsonInput === 'string' ? values.jsonInput.trim() : '';

          if (!jsonInput) {
            modal.updateElement('resultOutput', {
              value: 'JSON input is required.',
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
              value: getErrorMessage(error) || 'No supported runtime found. Install Deno or use Windows PowerShell.',
            });
          }

          return false;
        });

        modal.onClose(() => resolve());
      });
    }
  );

  sigma.commands.registerCommand(
    { id: 'runtime-diagnostics', title: 'Show runtime diagnostics', description: 'Displays runtime system info and includes PowerShell process diagnostics on Windows' },
    async () => {
      try {
        const powerShellSystemInfoScript = `$computerInfo = Get-ComputerInfo; $osName = if ($computerInfo.OsName) { $computerInfo.OsName } else { 'Windows' }; $osVersion = if ($computerInfo.OsVersion) { $computerInfo.OsVersion } else { '' }; $hostName = $env:COMPUTERNAME; $homePath = $env:USERPROFILE; [PSCustomObject]@{ os = 'windows'; arch = $env:PROCESSOR_ARCHITECTURE; denoVersion = ''; v8Version = ''; typescriptVersion = ''; hostname = $hostName; homeDir = $homePath; osName = $osName; osVersion = $osVersion } | ConvertTo-Json -Compress`;
        const fallbackCandidates = sigma.platform.isWindows
          ? getWindowsPowerShellCandidates(powerShellSystemInfoScript)
          : [];
        const systemInfoExecution = await sigma.ui.withProgress(
          {
            subtitle: 'Collecting system info',
            location: 'notification',
            cancellable: true,
          },
          async (progress, cancellationToken) => {
            progress.report({
              description: 'Preparing runtime...',
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
            title: 'System info cancelled',
            subtitle: 'Stopped collecting system info',
            type: 'warning'
          });
          return;
        }

        const { result, commandName } = systemInfoExecution;

        if (result.code !== 0) {
          sigma.ui.showNotification({
            title: 'System info',
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
          sigma.ui.input({ id: 'runtime', label: 'Runtime', value: runtimeLabel, disabled: true }),
          sigma.ui.input({ id: 'os', label: 'OS', value: info.os, disabled: true }),
          sigma.ui.input({ id: 'arch', label: 'Architecture', value: info.arch, disabled: true }),
          sigma.ui.separator(),
          sigma.ui.input({ id: 'deno', label: 'Deno', value: info.denoVersion ? `v${info.denoVersion}` : 'N/A', disabled: true }),
          sigma.ui.input({ id: 'v8', label: 'V8', value: info.v8Version ? `v${info.v8Version}` : 'N/A', disabled: true }),
          sigma.ui.input({ id: 'typescript', label: 'TypeScript', value: info.typescriptVersion ? `v${info.typescriptVersion}` : 'N/A', disabled: true }),
          sigma.ui.separator(),
          sigma.ui.input({ id: 'hostname', label: 'Hostname', value: info.hostname, disabled: true }),
          sigma.ui.input({ id: 'home', label: 'Home', value: info.homeDir, disabled: true }),
        ];

        if (info.osName) {
          infoContent.push(sigma.ui.input({ id: 'osName', label: 'OS Name', value: info.osName, disabled: true }));
        }
        if (info.osVersion) {
          infoContent.push(sigma.ui.input({ id: 'osVersion', label: 'OS Version', value: info.osVersion, disabled: true }));
        }
        if (sigma.platform.isWindows) {
          infoContent.push(sigma.ui.separator());
          infoContent.push(sigma.ui.text('PowerShell Process Diagnostics'));
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
                label: 'Running Processes',
                value: String(processDiagnostics.processCount || 0),
                disabled: true,
              })
            );
            infoContent.push(
              sigma.ui.textarea({
                id: 'topProcesses',
                label: 'Top CPU Processes',
                value: topProcessesText || 'No process data returned.',
                rows: 8,
                disabled: true,
              })
            );
          } else {
            infoContent.push(
              sigma.ui.text(processDiagnosticsErrorMessage || 'PowerShell process diagnostics are unavailable.')
            );
          }
        }

        sigma.ui.createModal({
          title: 'System info',
          width: 720,
          content: infoContent,
        });
      } catch (error) {
        sigma.ui.showNotification({
          title: 'System info',
          subtitle: getErrorMessage(error) || 'Failed to get system info',
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
