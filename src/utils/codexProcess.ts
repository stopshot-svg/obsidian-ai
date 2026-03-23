import type { SpawnOptionsWithoutStdio } from 'child_process';
import * as path from 'path';

export interface CodexSpawnSpec {
  command: string;
  args: string[];
  options: SpawnOptionsWithoutStdio;
}

function quoteForCmd(arg: string): string {
  if (!arg) {
    return '""';
  }

  if (!/[ \t"&()^<>|]/.test(arg)) {
    return arg;
  }

  return `"${arg.replace(/"/g, '""')}"`;
}

export function createCodexSpawnSpec(
  executablePath: string,
  args: string[],
  options: SpawnOptionsWithoutStdio
): CodexSpawnSpec {
  if (process.platform !== 'win32') {
    return {
      command: executablePath,
      args,
      options,
    };
  }

  const extension = path.extname(executablePath).toLowerCase();

  if (extension === '.ps1') {
    return {
      command: 'powershell.exe',
      args: [
        '-NoLogo',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        executablePath,
        ...args,
      ],
      options,
    };
  }

  if (extension === '.cmd' || extension === '.bat') {
    const commandLine = [quoteForCmd(executablePath), ...args.map(quoteForCmd)].join(' ');
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', commandLine],
      options,
    };
  }

  return {
    command: executablePath,
    args,
    options,
  };
}
