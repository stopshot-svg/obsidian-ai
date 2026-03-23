import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

import { CodexService } from '@/core/providers/CodexService';

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

describe('CodexService', () => {
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
        model: 'haiku',
      },
      getResolvedCodexCliPath: jest.fn().mockReturnValue('/usr/local/bin/codex'),
      getActiveEnvironmentVariables: jest.fn().mockReturnValue(''),
    } as any;

    return new CodexService(plugin, {} as any);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps thread.started to session capture without UI chunks', () => {
    const service = createService();
    const chunks = (service as any).mapThreadEventToChunks({
      type: 'thread.started',
      thread_id: 'thread-123',
    });

    expect(chunks).toEqual([]);
    expect(service.getSessionId()).toBe('thread-123');
  });

  it('maps completed agent messages to text chunks', () => {
    const service = createService();
    const chunks = (service as any).mapThreadEventToChunks({
      type: 'item.completed',
      item: {
        type: 'agent_message',
        text: 'Hello from Codex',
      },
    });

    expect(chunks).toEqual([{ type: 'text', content: 'Hello from Codex' }]);
  });

  it('maps turn.completed to usage and done chunks', () => {
    const service = createService();
    const chunks = (service as any).mapThreadEventToChunks({
      type: 'turn.completed',
      usage: {
        input_tokens: 10,
        cached_input_tokens: 2,
        output_tokens: 5,
      },
    });

    expect(chunks[0]).toMatchObject({
      type: 'usage',
      usage: expect.objectContaining({
        inputTokens: 10,
        cacheReadInputTokens: 2,
      }),
    });
    expect(chunks[1]).toEqual({ type: 'done' });
  });

  it('maps command execution items to bash tool chunks', () => {
    const service = createService();
    const started = (service as any).mapThreadEventToChunks({
      type: 'item.started',
      item: {
        id: 'cmd-1',
        type: 'command_execution',
        command: 'ls -la',
      },
    });

    expect(started).toEqual([{
      type: 'tool_use',
      id: 'cmd-1',
      name: 'Bash',
      input: { command: 'ls -la' },
    }]);

    const completed = (service as any).mapThreadEventToChunks({
      type: 'item.completed',
      item: {
        id: 'cmd-1',
        type: 'command_execution',
        aggregated_output: 'file-a\\nfile-b',
        status: 'completed',
      },
    });

    expect(completed).toEqual([{
      type: 'tool_result',
      id: 'cmd-1',
      content: 'file-a\\nfile-b',
      isError: false,
    }]);
  });

  it('passes model and external directories to codex exec', async () => {
    const { spawn } = jest.requireMock('child_process') as { spawn: jest.Mock };
    const child = new FakeChildProcess();
    spawn.mockReturnValue(child);

    const service = createService();

    setImmediate(() => {
      child.stdout.write(JSON.stringify({ type: 'turn.completed', usage: {} }) + '\n');
      child.stdout.end();
      child.stderr.end();
      child.emit('exit', 0, null);
    });

    const chunks: unknown[] = [];
    for await (const chunk of service.query(
      'hello',
      undefined,
      undefined,
      {
        model: 'gpt-5-codex',
        externalContextPaths: ['/tmp/project-a', '/tmp/project-b'],
      }
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toContainEqual({ type: 'done' });
    expect(spawn).toHaveBeenCalled();
    const args = spawn.mock.calls[0][1] as string[];
    expect(args).toContain('--model');
    expect(args).toContain('gpt-5-codex');
    expect(args).toContain('--add-dir');
    expect(args).toContain('/tmp/project-a');
    expect(args).toContain('/tmp/project-b');
  });
});
