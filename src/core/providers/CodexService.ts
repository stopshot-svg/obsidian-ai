import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import * as readline from 'readline';

import type { ImageAttachment, ChatMessage, StreamChunk } from '../types';
import type ClaudianPlugin from '../../main';
import type { McpServerManager } from '../mcp';
import { ClaudianService, type QueryOptions } from '../agent';
import { TOOL_BASH } from '../tools/toolNames';
import { parseEnvironmentVariables } from '../../utils/env';
import { getVaultPath } from '../../utils/path';

type CodexThreadEvent =
  | { type: 'thread.started'; thread_id: string }
  | {
    type: 'item.started' | 'item.updated';
    item?: {
      id?: string;
      type?: string;
      text?: string;
      message?: string;
      command?: string;
      aggregated_output?: string;
      exit_code?: number | null;
      status?: string;
    };
  }
  | { type: 'turn.completed'; usage?: { input_tokens?: number; cached_input_tokens?: number; output_tokens?: number } }
  | { type: 'turn.failed'; error?: { message?: string } }
  | {
    type: 'item.completed';
    item?: {
      id?: string;
      type?: string;
      text?: string;
      message?: string;
      command?: string;
      aggregated_output?: string;
      exit_code?: number | null;
      status?: string;
    };
  }
  | { type: 'error'; message?: string };

/**
 * Temporary Codex runtime placeholder.
 *
 * This keeps the UI and tab lifecycle provider-aware while the actual Codex
 * transport layer is being implemented.
 */
export class CodexService extends ClaudianService {
  private readonly codexPlugin: ClaudianPlugin;
  private runningProcess: ChildProcessWithoutNullStreams | null = null;

  constructor(plugin: ClaudianPlugin, mcpManager: McpServerManager) {
    super(plugin, mcpManager);
    this.codexPlugin = plugin;
  }

  isReady(): boolean {
    return Boolean(this.codexPlugin.getResolvedCodexCliPath());
  }

  async ensureReady(): Promise<boolean> {
    return Boolean(this.codexPlugin.getResolvedCodexCliPath());
  }

  async *query(
    prompt: string,
    _images?: ImageAttachment[],
    _conversationHistory?: ChatMessage[],
    _queryOptions?: QueryOptions
  ): AsyncGenerator<StreamChunk> {
    const resolvedCodexPath = this.codexPlugin.getResolvedCodexCliPath();
    if (!resolvedCodexPath) {
      yield {
        type: 'error',
        content: 'Codex CLI not found. Please configure the Codex CLI path or add `codex` to PATH.',
      };
      return;
    }

    const vaultPath = getVaultPath(this.codexPlugin.app);
    if (!vaultPath) {
      yield { type: 'error', content: 'Could not determine vault path' };
      return;
    }

    const commandArgs: string[] = [
      'exec',
      '--experimental-json',
      '--skip-git-repo-check',
      '--cd',
      vaultPath,
    ];

    const sessionId = this.getSessionId();
    if (sessionId) {
      commandArgs.push('resume', sessionId);
    }

    const env = this.buildExecEnv();
    const child = spawn(resolvedCodexPath, commandArgs, {
      cwd: vaultPath,
      env,
      stdio: 'pipe',
    });

    this.runningProcess = child;

    let spawnError: unknown | null = null;
    child.once('error', (error) => {
      spawnError = error;
    });

    child.stdin.write(prompt);
    child.stdin.end();

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
        const event = this.parseThreadEvent(line);
        if (!event) continue;

        const mapped = this.mapThreadEventToChunks(event);
        for (const chunk of mapped) {
          yield chunk;
        }
      }

      if (spawnError) {
        throw spawnError;
      }

      const { code, signal } = await exitPromise;
      if (code !== 0 || signal) {
        const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
        yield {
          type: 'error',
          content: stderr || `Codex exec failed with ${signal ? `signal ${signal}` : `code ${code ?? 1}`}`,
        };
        return;
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
    if (this.runningProcess && !this.runningProcess.killed) {
      try {
        this.runningProcess.kill();
      } catch {
        // Ignore cleanup failures.
      }
    }
    super.cleanup();
  }

  private buildExecEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    const customEnv = parseEnvironmentVariables(this.codexPlugin.getActiveEnvironmentVariables());
    for (const [key, value] of Object.entries(customEnv)) {
      env[key] = value;
    }
    env.GIT_TERMINAL_PROMPT = '0';
    return env;
  }

  private parseThreadEvent(line: string): CodexThreadEvent | null {
    try {
      return JSON.parse(line) as CodexThreadEvent;
    } catch {
      return null;
    }
  }

  private mapThreadEventToChunks(event: CodexThreadEvent): StreamChunk[] {
    switch (event.type) {
      case 'thread.started':
        this.setSessionId(event.thread_id);
        return [];
      case 'turn.completed':
        return [
          {
            type: 'usage',
            usage: {
              model: 'codex',
              inputTokens: event.usage?.input_tokens ?? 0,
              cacheCreationInputTokens: 0,
              cacheReadInputTokens: event.usage?.cached_input_tokens ?? 0,
              contextWindow: 0,
              contextTokens: 0,
              percentage: 0,
            },
            sessionId: this.getSessionId() ?? undefined,
          },
          { type: 'done' },
        ];
      case 'turn.failed':
        return [{ type: 'error', content: event.error?.message ?? 'Codex turn failed.' }];
      case 'error':
        return [{ type: 'error', content: event.message ?? 'Codex exec error.' }];
      case 'item.started':
      case 'item.updated':
        if (event.item?.type === 'command_execution' && event.item.command) {
          return [{
            type: 'tool_use',
            id: event.item.id ?? `codex-bash-${Date.now()}`,
            name: TOOL_BASH,
            input: { command: event.item.command },
          }];
        }
        return [];
      case 'item.completed': {
        const itemType = event.item?.type;
        if (itemType === 'agent_message' && event.item?.text) {
          return [{ type: 'text', content: event.item.text }];
        }
        if (itemType === 'reasoning' && event.item?.text) {
          return [{ type: 'thinking', content: event.item.text }];
        }
        if (itemType === 'command_execution' && event.item?.id) {
          return [{
            type: 'tool_result',
            id: event.item.id,
            content: event.item.aggregated_output ?? '',
            isError: event.item.status === 'failed',
          }];
        }
        if (itemType === 'error' && event.item?.message) {
          return [{ type: 'error', content: event.item.message }];
        }
        return [];
      }
      default:
        return [];
    }
  }
}
