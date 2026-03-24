import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

import { GeminiService, stripAnsi } from '@/core/providers/GeminiService';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

class FakeChildProcess extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;

  kill(): boolean {
    this.killed = true;
    return true;
  }
}

describe('GeminiService', () => {
  const createService = (mcpManager?: { getActiveServers: jest.Mock }) => {
    const plugin = {
      app: {
        vault: {
          adapter: {
            basePath: '/tmp/vault',
          },
        },
      },
      settings: {
        geminiModel: '',
        permissionMode: 'yolo',
        allowExternalAccess: false,
      },
      getResolvedGeminiCliPath: jest.fn().mockReturnValue('/usr/local/bin/gemini'),
      getActiveEnvironmentVariables: jest.fn().mockReturnValue(''),
    } as any;

    return new GeminiService(plugin, mcpManager as any ?? { getActiveServers: jest.fn().mockReturnValue({}) });
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    const fs = await import('fs/promises');
    await fs.rm('/tmp/vault/.gemini', { recursive: true, force: true });
  });

  it('does not pass --sandbox and uses a positional prompt for Gemini', async () => {
    const { spawn } = jest.requireMock('child_process') as { spawn: jest.Mock };
    const child = new FakeChildProcess();
    spawn.mockReturnValue(child);
    const mcpManager = {
      getActiveServers: jest.fn().mockReturnValue({
        search: { command: 'npx', args: ['gemini-search'] },
      }),
    };

    const service = createService(mcpManager);

    setImmediate(() => {
      child.stdout.write(JSON.stringify({ type: 'result', status: 'success' }) + '\n');
      child.stdout.end();
      child.stderr.end();
      child.emit('exit', 0, null);
    });

    const iterator = service.query('hello', undefined, undefined, {
      enabledMcpServers: new Set(['search']),
    });
    expect((await iterator.next()).value).toEqual({ type: 'done' });
    await iterator.return(undefined);

    const args = spawn.mock.calls[0][1] as string[];
    expect(args).not.toContain('--sandbox');
    expect(args).not.toContain('-p');
    expect(args[0]).toBe('--output-format');
    expect(args.at(-1)).toBe('hello');

    const fs = await import('fs/promises');
    const settings = JSON.parse(await fs.readFile('/tmp/vault/.gemini/settings.json', 'utf8'));
    expect(settings.mcpServers.search).toEqual({
      command: 'npx',
      args: ['gemini-search'],
    });
  });

  it('strips ANSI escape sequences from stderr errors', () => {
    expect(stripAnsi('\u001b[31mSandbox failed\u001b[0m')).toBe('Sandbox failed');
  });
});
