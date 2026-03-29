// @ts-check

/**
 * @param {unknown} error
 * @returns {string}
 */
export function getErrorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error);
}

/**
 * @param {unknown} error
 */
export function isCommandNotFoundError(error) {
  const errorMessage = getErrorMessage(error).toLowerCase();
  return (
    errorMessage.includes('not found')
    || errorMessage.includes('does not exist')
    || errorMessage.includes('cannot find')
  );
}

/**
 * @param {string} text
 */
export function escapeForPowerShellSingleQuotes(text) {
  return String(text).replace(/'/g, "''");
}

/**
 * @param {string} script
 */
export function getWindowsPowerShellCandidates(script) {
  return [
    { command: 'powershell', args: ['-NoProfile', '-Command', script] },
    { command: 'pwsh', args: ['-NoProfile', '-Command', script] },
    { command: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', args: ['-NoProfile', '-Command', script] },
  ];
}

/**
 * @param {string} script
 * @param {{ timeout?: number, parseOutput?: (o: { stdout: string, stderr: string }) => unknown, signal?: AbortSignal }} [options]
 */
export async function runPowerShellScript(script, options = {}) {
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

/**
 * @param {{ command: string, args: string[] }[]} commandCandidates
 */
export async function runFirstAvailableCommand(commandCandidates) {
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

/**
 * @param {string[]} denoArgs
 */
export async function getDenoCommandCandidates(denoArgs) {
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

/**
 * @param {{ command: string, args: string[] }[]} commandCandidates
 * @param {import('@sigma-file-manager/api').Progress} progress
 * @param {import('@sigma-file-manager/api').CancellationToken} cancellationToken
 * @param {(key: string, params?: Record<string, string | number>) => string} translate
 */
export async function runFirstAvailableCommandWithProgress(commandCandidates, progress, cancellationToken, translate) {
  let latestError = null;
  let progressValue = 8;

  for (const commandCandidate of commandCandidates) {
    if (cancellationToken.isCancellationRequested) {
      return { cancelled: true };
    }

    try {
      progress.report({
        description: translate('runningCommand', { command: commandCandidate.command }),
        increment: progressValue,
      });
      progressValue = 0;

      const runningCommand = await sigma.shell.runWithProgress(
        commandCandidate.command,
        commandCandidate.args,
        () => {
          if (!cancellationToken.isCancellationRequested) {
            progress.report({
              description: translate('analyzingWith', { command: commandCandidate.command }),
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
