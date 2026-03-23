import { CodexService } from '@/core/providers/CodexService';

describe('CodexService', () => {
  const createService = () => {
    const plugin = {
      app: {},
      settings: {
        model: 'haiku',
      },
      getResolvedCodexCliPath: jest.fn().mockReturnValue('/usr/local/bin/codex'),
      getActiveEnvironmentVariables: jest.fn().mockReturnValue(''),
    } as any;

    return new CodexService(plugin, {} as any);
  };

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
});
