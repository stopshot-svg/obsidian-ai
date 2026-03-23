import { type ChildProcessWithoutNullStreams,spawn } from 'child_process';
import * as readline from 'readline';

import { buildRefineSystemPrompt } from '../../../core/prompts/instructionRefine';
import type { InstructionRefineResult } from '../../../core/types';
import type ClaudianPlugin from '../../../main';
import { parseEnvironmentVariables } from '../../../utils/env';
import { getVaultPath } from '../../../utils/path';
import type { InstructionRefineServiceLike, RefineProgressCallback } from './InstructionRefineService';

type CodexInstructionEvent =
  | { type: 'thread.started'; thread_id: string }
  | { type: 'item.completed'; item?: { type?: string; text?: string } }
  | { type: 'turn.failed'; error?: { message?: string } }
  | { type: 'error'; message?: string };

export class CodexInstructionRefineService implements InstructionRefineServiceLike {
  private plugin: ClaudianPlugin;
  private runningProcess: ChildProcessWithoutNullStreams | null = null;
  private threadId: string | null = null;
  private existingInstructions = '';

  constructor(plugin: ClaudianPlugin) {
    this.plugin = plugin;
  }

  resetConversation(): void {
    this.threadId = null;
  }

  async refineInstruction(
    rawInstruction: string,
    existingInstructions: string,
    onProgress?: RefineProgressCallback
  ): Promise<InstructionRefineResult> {
    this.threadId = null;
    this.existingInstructions = existingInstructions;
    const prompt = `Please refine this instruction: "${rawInstruction}"`;
    return this.sendMessage(prompt, onProgress);
  }

  async continueConversation(
    message: string,
    onProgress?: RefineProgressCallback
  ): Promise<InstructionRefineResult> {
    if (!this.threadId) {
      return { success: false, error: 'No active conversation to continue' };
    }
    return this.sendMessage(message, onProgress);
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

  private async sendMessage(
    prompt: string,
    onProgress?: RefineProgressCallback
  ): Promise<InstructionRefineResult> {
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

    const fullPrompt = `${buildRefineSystemPrompt(this.existingInstructions)}\n\n${prompt}`;
    const child = spawn(resolvedCodexPath, commandArgs, {
      cwd: vaultPath,
      env: this.buildExecEnv(),
      stdio: 'pipe',
    });
    this.runningProcess = child;

    const exitPromise = new Promise<number | null>((resolve) => {
      child.once('exit', (code) => resolve(code));
    });

    child.stdin.write(fullPrompt);
    child.stdin.end();

    const rl = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    });

    let responseText = '';
    let errorMessage: string | null = null;

    try {
      for await (const line of rl) {
        const event = this.parseEvent(line);
        if (!event) continue;
        if (event.type === 'thread.started') {
          this.threadId = event.thread_id;
        } else if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item.text) {
          responseText += event.item.text;
          if (onProgress) {
            onProgress(this.parseResponse(responseText));
          }
        } else if (event.type === 'turn.failed') {
          errorMessage = event.error?.message ?? 'Codex instruction refinement failed';
        } else if (event.type === 'error') {
          errorMessage = event.message ?? 'Codex instruction refinement failed';
        }
      }

      const exitCode = await exitPromise;
      if (errorMessage) {
        return { success: false, error: errorMessage };
      }
      if (exitCode !== 0) {
        return { success: false, error: `Codex exited with code ${exitCode ?? 1}` };
      }
      return this.parseResponse(responseText);
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

  private parseResponse(responseText: string): InstructionRefineResult {
    const instructionMatch = responseText.match(/<instruction>([\s\S]*?)<\/instruction>/);
    if (instructionMatch) {
      return { success: true, refinedInstruction: instructionMatch[1].trim() };
    }

    const trimmed = responseText.trim();
    if (trimmed) {
      return { success: true, clarification: trimmed };
    }

    return { success: false, error: 'Empty response' };
  }

  private parseEvent(line: string): CodexInstructionEvent | null {
    try {
      return JSON.parse(line) as CodexInstructionEvent;
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
