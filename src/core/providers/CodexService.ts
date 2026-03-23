import type { ImageAttachment, ChatMessage, StreamChunk } from '../types';
import type ClaudianPlugin from '../../main';
import type { McpServerManager } from '../mcp';
import { ClaudianService, type QueryOptions } from '../agent';

/**
 * Temporary Codex runtime placeholder.
 *
 * This keeps the UI and tab lifecycle provider-aware while the actual Codex
 * transport layer is being implemented.
 */
export class CodexService extends ClaudianService {
  private readonly codexPlugin: ClaudianPlugin;

  constructor(plugin: ClaudianPlugin, mcpManager: McpServerManager) {
    super(plugin, mcpManager);
    this.codexPlugin = plugin;
  }

  async ensureReady(): Promise<boolean> {
    return Boolean(this.codexPlugin.getResolvedCodexCliPath());
  }

  async *query(
    _prompt: string,
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

    yield {
      type: 'error',
      content: 'Codex runtime wiring is in progress. Provider switching is enabled, but chat execution has not been migrated yet.',
    };
  }
}
