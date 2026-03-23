import { type ChildProcessWithoutNullStreams,spawn } from 'child_process';
import * as readline from 'readline';

import type ClaudianPlugin from '../../../main';
import { buildCodexExecEnv } from '../../../utils/codexEnv';
import { getVaultPath } from '../../../utils/path';
import type { TitleGenerationCallback } from './TitleGenerationService';

type CodexTitleEvent =
  | { type: 'item.completed'; item?: { type?: string; text?: string } }
  | { type: 'turn.failed'; error?: { message?: string } }
  | { type: 'error'; message?: string };

export class CodexTitleGenerationService {
  private plugin: ClaudianPlugin;
  private activeGenerations: Map<string, ChildProcessWithoutNullStreams> = new Map();

  constructor(plugin: ClaudianPlugin) {
    this.plugin = plugin;
  }

  async generateTitle(
    conversationId: string,
    userMessage: string,
    callback: TitleGenerationCallback
  ): Promise<void> {
    const vaultPath = getVaultPath(this.plugin.app);
    if (!vaultPath) {
      await callback(conversationId, { success: false, error: 'Could not determine vault path' });
      return;
    }

    const resolvedCodexPath = this.plugin.getResolvedCodexCliPath();
    if (!resolvedCodexPath) {
      await callback(conversationId, { success: false, error: 'Codex CLI not found' });
      return;
    }

    const existing = this.activeGenerations.get(conversationId);
    if (existing && !existing.killed) {
      try {
        existing.kill();
      } catch {
        // ignore
      }
    }

    const prompt = `Generate a concise 2-5 word conversation title.\nReturn only the title, no quotes or explanation.\n\nUser request:\n"""\n${this.truncateText(userMessage, 500)}\n"""`;
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

    const child = spawn(resolvedCodexPath, commandArgs, {
      cwd: vaultPath,
      env: this.buildExecEnv(),
      stdio: 'pipe',
    });
    this.activeGenerations.set(conversationId, child);

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
        if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item.text) {
          responseText += event.item.text;
        } else if (event.type === 'turn.failed') {
          streamError = event.error?.message ?? 'Codex title generation failed';
        } else if (event.type === 'error') {
          streamError = event.message ?? 'Codex title generation failed';
        }
      }

      const exitCode = await exitPromise;

      if (streamError) {
        await callback(conversationId, { success: false, error: streamError });
        return;
      }

      if (exitCode !== 0) {
        await callback(conversationId, { success: false, error: `Codex exited with code ${exitCode ?? 1}` });
        return;
      }

      const title = this.parseTitle(responseText);
      if (!title) {
        await callback(conversationId, { success: false, error: 'Failed to parse title from response' });
        return;
      }

      await callback(conversationId, { success: true, title });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await callback(conversationId, { success: false, error: message });
    } finally {
      rl.close();
      this.activeGenerations.delete(conversationId);
      if (!child.killed) {
        try {
          child.kill();
        } catch {
          // ignore
        }
      }
    }
  }

  cancel(): void {
    for (const child of this.activeGenerations.values()) {
      if (!child.killed) {
        try {
          child.kill();
        } catch {
          // ignore
        }
      }
    }
    this.activeGenerations.clear();
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}...`;
  }

  private parseEvent(line: string): CodexTitleEvent | null {
    try {
      return JSON.parse(line) as CodexTitleEvent;
    } catch {
      return null;
    }
  }

  private parseTitle(responseText: string): string | null {
    const trimmed = responseText.trim().replace(/^["']|["']$/g, '').replace(/[.?!]+$/g, '');
    if (!trimmed) {
      return null;
    }
    return trimmed.length > 50 ? `${trimmed.slice(0, 47)}...` : trimmed;
  }

  private buildExecEnv(): NodeJS.ProcessEnv {
    return buildCodexExecEnv(this.plugin.getActiveEnvironmentVariables?.() ?? '');
  }
}
