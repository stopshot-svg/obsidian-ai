import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

import { CodexTitleGenerationService } from '@/features/chat/services/CodexTitleGenerationService';

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

describe('CodexTitleGenerationService', () => {
  it('parses a title from Codex agent_message output', async () => {
    const { spawn } = jest.requireMock('child_process') as { spawn: jest.Mock };
    const child = new FakeChildProcess();
    spawn.mockReturnValue(child);

    const plugin = {
      app: {
        vault: {
          adapter: {
            basePath: '/tmp/vault',
          },
        },
      },
      settings: {
        codexModel: '',
        allowExternalAccess: false,
      },
      getResolvedCodexCliPath: jest.fn().mockReturnValue('/usr/local/bin/codex'),
    } as any;

    const service = new CodexTitleGenerationService(plugin);
    const callback = jest.fn().mockResolvedValue(undefined);

    setImmediate(() => {
      child.stdout.write(JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: 'Codex Generated Title' },
      }) + '\n');
      child.stdout.end();
      child.stderr.end();
      child.emit('exit', 0, null);
    });

    await service.generateTitle('conv-1', 'Please summarize this conversation', callback);

    expect(callback).toHaveBeenCalledWith('conv-1', {
      success: true,
      title: 'Codex Generated Title',
    });
  });
});
