import type ClaudianPlugin from '../../main';
import { ClaudianService } from '../agent';
import type { McpServerManager } from '../mcp';
import type { ProviderId } from '../types';
import { CodexService } from './CodexService';

export function createRuntimeService(
  plugin: ClaudianPlugin,
  mcpManager: McpServerManager,
  providerId: ProviderId
): ClaudianService {
  if (providerId === 'codex') {
    return new CodexService(plugin, mcpManager);
  }

  return new ClaudianService(plugin, mcpManager);
}
