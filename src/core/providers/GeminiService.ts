import { type ChildProcessWithoutNullStreams,spawn } from 'child_process';
import * as readline from 'readline';

import type ClaudianPlugin from '../../main';
import { parseEnvironmentVariables } from '../../utils/env';
import { createGeminiSpawnSpec } from '../../utils/geminiProcess';
import { getVaultPath } from '../../utils/path';
import { ClaudianService, type QueryOptions } from '../agent';
import type { McpServerManager } from '../mcp';
import type { ChatMessage, ImageAttachment, StreamChunk } from '../types';

type GeminiStreamEvent =
  | { type: 'init'; session_id?: string; model?: string }
  | { type: 'message'; role?: 'user' | 'assistant'; content?: string; delta?: boolean }
  | { type: 'tool_use'; tool_id?: string; tool_name?: string; parameters?: Record<string, unknown> }
  | { type: 'tool_result'; tool_id?: string; status?: 'success' | 'error'; output?: string; error?: { message?: string } }
  | { type: 'result'; status?: 'success' | 'error'; error?: { message?: string } }
  | { type: 'error'; message?: string; severity?: string };

function stripAnsi(text: string): string {
  const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
  return text.replace(ansiPattern, '');
}

export class GeminiService extends ClaudianService {
  private readonly geminiPlugin: ClaudianPlugin;
  private runningProcess: ChildProcessWithoutNullStreams | null = null;

  constructor(plugin: ClaudianPlugin, mcpManager: McpServerManager) {
    super(plugin, mcpManager);
    this.geminiPlugin = plugin;
  }

  isReady(): boolean {
    return Boolean(this.geminiPlugin.getResolvedGeminiCliPath());
  }

  async ensureReady(): Promise<boolean> {
    return Boolean(this.geminiPlugin.getResolvedGeminiCliPath());
  }

  async *query(
    prompt: string,
    _images?: ImageAttachment[],
    _conversationHistory?: ChatMessage[],
    queryOptions?: QueryOptions
  ): AsyncGenerator<StreamChunk> {
    const resolvedGeminiPath = this.geminiPlugin.getResolvedGeminiCliPath();
    if (!resolvedGeminiPath) {
      yield {
        type: 'error',
        content: 'Gemini CLI not found. Please configure the Gemini CLI path or add `gemini` to PATH.',
      };
      return;
    }

    const vaultPath = getVaultPath(this.geminiPlugin.app);
    if (!vaultPath) {
      yield { type: 'error', content: 'Could not determine vault path' };
      return;
    }

    const commandArgs: string[] = ['-p', prompt, '--output-format', 'stream-json'];
    const selectedModel = queryOptions?.model?.trim() || this.geminiPlugin.settings.geminiModel?.trim();
    if (selectedModel) {
      commandArgs.push('--model', selectedModel);
    }

    const sessionId = this.getSessionId();
    if (sessionId) {
      commandArgs.push('--resume', sessionId);
    }

    const additionalDirectories = queryOptions?.externalContextPaths ?? [];
    for (const dir of additionalDirectories) {
      if (dir && dir.trim()) {
        commandArgs.push('--include-directories', dir.trim());
      }
    }

    switch (this.geminiPlugin.settings.permissionMode) {
      case 'yolo':
        commandArgs.push('--approval-mode', 'yolo');
        break;
      case 'plan':
        commandArgs.push('--approval-mode', 'plan');
        break;
      case 'normal':
      default:
        commandArgs.push('--approval-mode', 'default');
        break;
    }

    const spawnSpec = createGeminiSpawnSpec(resolvedGeminiPath, commandArgs, {
      cwd: vaultPath,
      env: this.buildExecEnv(),
      stdio: 'pipe',
    });
    const child = spawn(spawnSpec.command, spawnSpec.args, spawnSpec.options);
    this.runningProcess = child;

    let spawnError: unknown | null = null;
    child.once('error', (error) => {
      spawnError = error;
    });

    const stderrChunks: Buffer[] = [];
    child.stderr.on('data', (data) => {
      stderrChunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
    });

    const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });

    const rl = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    });

    try {
      for await (const line of rl) {
        const event = this.parseStreamEvent(line);
        if (!event) continue;

        const mapped = this.mapStreamEventToChunks(event);
        for (const chunk of mapped) {
          yield chunk;
        }
      }

      if (spawnError) {
        throw spawnError;
      }

      const { code, signal } = await exitPromise;
      if (code !== 0 || signal) {
        const stderr = stripAnsi(Buffer.concat(stderrChunks).toString('utf8')).trim();
        yield {
          type: 'error',
          content: stderr || `Gemini CLI failed with ${signal ? `signal ${signal}` : `code ${code ?? 1}`}`,
        };
      }
    } finally {
      rl.close();
      this.runningProcess = null;
      if (!child.killed) {
        try {
          child.kill();
        } catch {
          // Ignore cleanup failures.
        }
      }
    }
  }

  cancel() {
    if (this.runningProcess && !this.runningProcess.killed) {
      try {
        this.runningProcess.kill();
      } catch {
        // Ignore cancellation failures.
      }
    }
    super.cancel();
  }

  cleanup() {
    this.cancel();
    super.cleanup();
  }

  private buildExecEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    const customEnv = parseEnvironmentVariables(this.geminiPlugin.getActiveEnvironmentVariables());
    for (const [key, value] of Object.entries(customEnv)) {
      env[key] = value;
    }
    env.GIT_TERMINAL_PROMPT = '0';
    return env;
  }

  private parseStreamEvent(line: string): GeminiStreamEvent | null {
    try {
      return JSON.parse(line) as GeminiStreamEvent;
    } catch {
      return null;
    }
  }

  private mapStreamEventToChunks(event: GeminiStreamEvent): StreamChunk[] {
    switch (event.type) {
      case 'init':
        if (event.session_id) {
          this.setSessionId(event.session_id);
        }
        return [];
      case 'message':
        if (event.role === 'assistant' && event.content) {
          return [{ type: 'text', content: event.content }];
        }
        return [];
      case 'tool_use':
        if (event.tool_id && event.tool_name) {
          return [{
            type: 'tool_use',
            id: event.tool_id,
            name: event.tool_name,
            input: event.parameters ?? {},
          }];
        }
        return [];
      case 'tool_result':
        if (event.tool_id) {
          return [{
            type: 'tool_result',
            id: event.tool_id,
            content: event.output ?? event.error?.message ?? '',
            isError: event.status === 'error',
          }];
        }
        return [];
      case 'result':
        if (event.status === 'error') {
          return [{ type: 'error', content: event.error?.message ?? 'Gemini CLI run failed.' }];
        }
        return [{ type: 'done' }];
      case 'error':
        return [{ type: 'error', content: event.message ?? 'Gemini CLI error.' }];
      default:
        return [];
    }
  }
}
