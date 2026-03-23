import { type ChildProcessWithoutNullStreams,spawn } from 'child_process';
import * as readline from 'readline';

import type ClaudianPlugin from '../../main';
import { createCodexSpawnSpec } from '../../utils/codexProcess';
import { appendContextFiles } from '../../utils/context';
import { parseEnvironmentVariables } from '../../utils/env';
import { getVaultPath } from '../../utils/path';
import {
  buildInlineEditPrompt,
  type InlineEditRequest,
  type InlineEditResult,
  parseInlineEditResponse,
} from './InlineEditService';

type CodexInlineEditEvent =
  | { type: 'thread.started'; thread_id: string }
  | { type: 'item.completed'; item?: { type?: string; text?: string } }
  | { type: 'turn.failed'; error?: { message?: string } }
  | { type: 'error'; message?: string };

export class CodexInlineEditService {
  private plugin: ClaudianPlugin;
  private runningProcess: ChildProcessWithoutNullStreams | null = null;
  private threadId: string | null = null;

  constructor(plugin: ClaudianPlugin) {
    this.plugin = plugin;
  }

  resetConversation(): void {
    this.threadId = null;
  }

  async editText(request: InlineEditRequest): Promise<InlineEditResult> {
    this.threadId = null;
    const prompt = buildInlineEditPrompt(request);
    return this.sendMessage(prompt);
  }

  async continueConversation(message: string, contextFiles?: string[]): Promise<InlineEditResult> {
    if (!this.threadId) {
      return { success: false, error: 'No active conversation to continue' };
    }
    let prompt = message;
    if (contextFiles && contextFiles.length > 0) {
      prompt = appendContextFiles(message, contextFiles);
    }
    return this.sendMessage(prompt);
  }

  cancel(): void {
    if (this.runningProcess && !this.runningProcess.killed) {
      try {
        this.runningProcess.kill();
      } catch {
        // ignore
      }
    }
    this.runningProcess = null;
  }

  private async sendMessage(prompt: string): Promise<InlineEditResult> {
    const vaultPath = getVaultPath(this.plugin.app);
    if (!vaultPath) {
      return { success: false, error: 'Could not determine vault path' };
    }

    const resolvedCodexPath = this.plugin.getResolvedCodexCliPath();
    if (!resolvedCodexPath) {
      return { success: false, error: 'Codex CLI not found. Please install Codex CLI.' };
    }

    const commandArgs = [
      'exec',
      '--experimental-json',
      '--skip-git-repo-check',
      '--sandbox',
      this.plugin.settings.allowExternalAccess ? 'danger-full-access' : 'workspace-write',
      '--cd',
      vaultPath,
      '--config',
      'approval_policy="never"',
    ];

    const model = this.plugin.settings.codexModel?.trim();
    if (model) {
      commandArgs.push('--model', model);
    }

    if (this.threadId) {
      commandArgs.push('resume', this.threadId);
    }

    const spawnSpec = createCodexSpawnSpec(resolvedCodexPath, commandArgs, {
      cwd: vaultPath,
      env: this.buildExecEnv(),
      stdio: 'pipe',
    });
    const child = spawn(spawnSpec.command, spawnSpec.args, spawnSpec.options);
    this.runningProcess = child;

    const exitPromise = new Promise<number | null>((resolve) => {
      child.once('exit', (code) => resolve(code));
    });

    child.stdin.write(prompt);
    child.stdin.end();

    const rl = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    });

    let responseText = '';
    let streamError: string | null = null;

    try {
      for await (const line of rl) {
        const event = this.parseEvent(line);
        if (!event) continue;
        if (event.type === 'thread.started') {
          this.threadId = event.thread_id;
        } else if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item.text) {
          responseText += event.item.text;
        } else if (event.type === 'turn.failed') {
          streamError = event.error?.message ?? 'Codex inline edit failed';
        } else if (event.type === 'error') {
          streamError = event.message ?? 'Codex inline edit failed';
        }
      }

      const exitCode = await exitPromise;
      if (streamError) {
        return { success: false, error: streamError };
      }
      if (exitCode !== 0) {
        return { success: false, error: `Codex exited with code ${exitCode ?? 1}` };
      }
      return parseInlineEditResponse(responseText);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    } finally {
      this.runningProcess = null;
      rl.close();
      if (!child.killed) {
        try {
          child.kill();
        } catch {
          // ignore
        }
      }
    }
  }

  private parseEvent(line: string): CodexInlineEditEvent | null {
    try {
      return JSON.parse(line) as CodexInlineEditEvent;
    } catch {
      return null;
    }
  }

  private buildExecEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    const customEnv = parseEnvironmentVariables(this.plugin.getActiveEnvironmentVariables?.() ?? '');
    for (const [key, value] of Object.entries(customEnv)) {
      env[key] = value;
    }
    env.GIT_TERMINAL_PROMPT = '0';
    return env;
  }
}
