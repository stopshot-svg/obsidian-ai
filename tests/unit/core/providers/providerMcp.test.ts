import * as fs from 'fs/promises';

import {
  resolveProviderMcpServers,
  writeCodexProjectMcpConfig,
  writeGeminiProjectMcpConfig,
} from '@/core/providers/providerMcp';

describe('providerMcp', () => {
  const vaultPath = '/tmp/claudian-provider-mcp-tests';

  beforeEach(async () => {
    await fs.rm(vaultPath, { recursive: true, force: true });
  });

  afterAll(async () => {
    await fs.rm(vaultPath, { recursive: true, force: true });
  });

  it('combines mentions and enabled servers before resolving active servers', () => {
    const mcpManager = {
      getActiveServers: jest.fn().mockReturnValue({
        alpha: { command: 'npx', args: ['alpha'] },
      }),
    } as any;

    const result = resolveProviderMcpServers(mcpManager, {
      mcpMentions: new Set(['alpha']),
      enabledMcpServers: new Set(['beta']),
    });

    expect(result).toEqual({
      alpha: { command: 'npx', args: ['alpha'] },
    });
    expect(mcpManager.getActiveServers).toHaveBeenCalledWith(new Set(['alpha', 'beta']));
  });

  it('writes Codex project config in TOML format', async () => {
    const codexHome = await writeCodexProjectMcpConfig(vaultPath, {
      'stdio-server': {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
        env: { FOO: 'bar' },
      },
      'http-server': {
        type: 'http',
        url: 'https://example.com/mcp',
        headers: { Authorization: 'Bearer token' },
      },
    });

    expect(codexHome).toBe(`${vaultPath}/.claude/provider-mcp/codex`);
    const content = await fs.readFile(`${codexHome}/config.toml`, 'utf8');
    expect(content).toContain('[mcp_servers.stdio-server]');
    expect(content).toContain('command = "npx"');
    expect(content).toContain('args = ["-y", "@modelcontextprotocol/server-filesystem"]');
    expect(content).toContain('[mcp_servers.stdio-server.env]');
    expect(content).toContain('FOO = "bar"');
    expect(content).toContain('[mcp_servers.http-server]');
    expect(content).toContain('url = "https://example.com/mcp"');
    expect(content).toContain('transport = "http"');
    expect(content).toContain('[mcp_servers.http-server.headers]');
  });

  it('merges Gemini MCP settings without dropping unrelated config', async () => {
    await fs.mkdir(`${vaultPath}/.gemini`, { recursive: true });
    await fs.writeFile(
      `${vaultPath}/.gemini/settings.json`,
      `${JSON.stringify({
        theme: 'dark',
        mcpServers: {
          manual: { command: 'manual-server' },
          oldManaged: { command: 'stale' },
        },
        _claudianManagedMcpServers: ['oldManaged'],
      }, null, 2)}\n`,
      'utf8'
    );

    await writeGeminiProjectMcpConfig(vaultPath, {
      managed: {
        command: 'npx',
        args: ['managed-server'],
      },
    });

    const saved = JSON.parse(await fs.readFile(`${vaultPath}/.gemini/settings.json`, 'utf8'));
    expect(saved.theme).toBe('dark');
    expect(saved.mcpServers.manual).toEqual({ command: 'manual-server' });
    expect(saved.mcpServers.oldManaged).toBeUndefined();
    expect(saved.mcpServers.managed).toEqual({
      command: 'npx',
      args: ['managed-server'],
    });
    expect(saved._claudianManagedMcpServers).toEqual(['managed']);
  });
});
