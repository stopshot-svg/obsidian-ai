import * as fs from 'fs/promises';
import * as path from 'path';

import type { QueryOptions } from '../agent';
import type { McpServerManager } from '../mcp';
import type { McpServerConfig } from '../types';

const CODEX_CONFIG_DIR = path.join('.claude', 'provider-mcp', 'codex');
const CODEX_CONFIG_PATH = path.join(CODEX_CONFIG_DIR, 'config.toml');
const GEMINI_CONFIG_DIR = '.gemini';
const GEMINI_CONFIG_PATH = path.join(GEMINI_CONFIG_DIR, 'settings.json');
const GEMINI_MANAGED_SERVERS_KEY = '_claudianManagedMcpServers';

type GeminiSettingsFile = Record<string, unknown> & {
  mcpServers?: Record<string, unknown>;
  [GEMINI_MANAGED_SERVERS_KEY]?: string[];
};

export function resolveProviderMcpServers(
  mcpManager: McpServerManager,
  queryOptions?: QueryOptions
): Record<string, McpServerConfig> {
  const mcpMentions = queryOptions?.mcpMentions ?? new Set<string>();
  const enabledMcpServers = queryOptions?.enabledMcpServers ?? new Set<string>();
  const activeMentions = new Set([...mcpMentions, ...enabledMcpServers]);
  return mcpManager.getActiveServers(activeMentions);
}

export async function writeCodexProjectMcpConfig(
  vaultPath: string,
  servers: Record<string, McpServerConfig>
): Promise<string> {
  const codexHome = path.join(vaultPath, CODEX_CONFIG_DIR);
  await fs.mkdir(codexHome, { recursive: true });
  await fs.writeFile(path.join(vaultPath, CODEX_CONFIG_PATH), serializeCodexMcpConfig(servers), 'utf8');
  return codexHome;
}

export async function writeGeminiProjectMcpConfig(
  vaultPath: string,
  servers: Record<string, McpServerConfig>
): Promise<string> {
  const geminiDir = path.join(vaultPath, GEMINI_CONFIG_DIR);
  const settingsPath = path.join(vaultPath, GEMINI_CONFIG_PATH);
  await fs.mkdir(geminiDir, { recursive: true });

  const existing = await readGeminiSettingsFile(settingsPath);
  const managedServers = new Set(existing[GEMINI_MANAGED_SERVERS_KEY] ?? []);
  const currentServers = isRecord(existing.mcpServers) ? { ...existing.mcpServers } : {};

  for (const serverName of managedServers) {
    delete currentServers[serverName];
  }

  for (const [serverName, config] of Object.entries(servers)) {
    currentServers[serverName] = toGeminiMcpConfig(config);
  }

  if (Object.keys(currentServers).length > 0) {
    existing.mcpServers = currentServers;
  } else {
    delete existing.mcpServers;
  }

  existing[GEMINI_MANAGED_SERVERS_KEY] = Object.keys(servers).sort();
  await fs.writeFile(settingsPath, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
  return settingsPath;
}

function serializeCodexMcpConfig(servers: Record<string, McpServerConfig>): string {
  const lines: string[] = [];

  for (const [serverName, config] of Object.entries(servers)) {
    lines.push(`[mcp_servers.${quoteTomlKey(serverName)}]`);

    if ('command' in config) {
      lines.push(`command = ${quoteTomlString(config.command)}`);

      if (config.args && config.args.length > 0) {
        lines.push(`args = ${formatTomlStringArray(config.args)}`);
      }

      if (config.env && Object.keys(config.env).length > 0) {
        lines.push('');
        lines.push(`[mcp_servers.${quoteTomlKey(serverName)}.env]`);
        for (const [key, value] of Object.entries(config.env).sort(([left], [right]) => left.localeCompare(right))) {
          lines.push(`${quoteTomlKey(key)} = ${quoteTomlString(value)}`);
        }
      }
    } else {
      lines.push(`url = ${quoteTomlString(config.url)}`);
      lines.push(`transport = ${quoteTomlString(config.type === 'sse' ? 'sse' : 'http')}`);

      if (config.headers && Object.keys(config.headers).length > 0) {
        lines.push('');
        lines.push(`[mcp_servers.${quoteTomlKey(serverName)}.headers]`);
        for (const [key, value] of Object.entries(config.headers).sort(([left], [right]) => left.localeCompare(right))) {
          lines.push(`${quoteTomlKey(key)} = ${quoteTomlString(value)}`);
        }
      }
    }

    lines.push('');
  }

  return lines.length > 0 ? `${lines.join('\n').trimEnd()}\n` : '';
}

function toGeminiMcpConfig(config: McpServerConfig): Record<string, unknown> {
  if ('command' in config) {
    const result: Record<string, unknown> = {
      command: config.command,
    };

    if (config.args && config.args.length > 0) {
      result.args = [...config.args];
    }

    if (config.env && Object.keys(config.env).length > 0) {
      result.env = { ...config.env };
    }

    return result;
  }

  const result: Record<string, unknown> = {
    url: config.url,
    transport: config.type === 'sse' ? 'sse' : 'http',
  };

  if (config.headers && Object.keys(config.headers).length > 0) {
    result.headers = { ...config.headers };
  }

  return result;
}

async function readGeminiSettingsFile(settingsPath: string): Promise<GeminiSettingsFile> {
  try {
    const content = await fs.readFile(settingsPath, 'utf8');
    const parsed = JSON.parse(content) as unknown;
    return isRecord(parsed) ? { ...parsed } as GeminiSettingsFile : {};
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return {};
    }
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function quoteTomlKey(key: string): string {
  if (/^[A-Za-z0-9_-]+$/.test(key)) {
    return key;
  }

  return quoteTomlString(key);
}

function quoteTomlString(value: string): string {
  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')}"`;
}

function formatTomlStringArray(values: string[]): string {
  return `[${values.map((value) => quoteTomlString(value)).join(', ')}]`;
}
