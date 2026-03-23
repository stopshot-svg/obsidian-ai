import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

import { GeminiService } from '@/core/providers/GeminiService';

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
  const createService = () => {
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

    return new GeminiService(plugin, {} as any);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not pass --sandbox by default for Gemini', async () => {
    const { spawn } = jest.requireMock('child_process') as { spawn: jest.Mock };
    const child = new FakeChildProcess();
    spawn.mockReturnValue(child);

    const service = createService();

    setImmediate(() => {
      child.stdout.write(JSON.stringify({ type: 'result', status: 'success' }) + '\n');
      child.stdout.end();
      child.stderr.end();
      child.emit('exit', 0, null);
    });

    for await (const chunk of service.query('hello')) {
      expect(chunk).toBeDefined();
    }

    const args = spawn.mock.calls[0][1] as string[];
    expect(args).not.toContain('--sandbox');
  });

  it('strips ANSI escape sequences from stderr errors', async () => {
    const { spawn } = jest.requireMock('child_process') as { spawn: jest.Mock };
    const child = new FakeChildProcess();
    spawn.mockReturnValue(child);

    const service = createService();
    const chunksPromise = (async () => {
      const chunks = [];
      for await (const chunk of service.query('hello')) {
        chunks.push(chunk);
      }
      return chunks;
    })();

    setImmediate(() => {
      child.stdout.end();
      child.stderr.write('\u001b[31mSandbox failed\u001b[0m');
      child.stderr.end();
      child.emit('exit', 1, null);
    });

    const chunks = await chunksPromise;
    expect(chunks).toContainEqual({ type: 'error', content: 'Sandbox failed' });
  });
});
