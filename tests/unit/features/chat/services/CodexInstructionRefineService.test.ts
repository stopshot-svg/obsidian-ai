import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

import { CodexInstructionRefineService } from '@/features/chat/services/CodexInstructionRefineService';

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

describe('CodexInstructionRefineService', () => {
  it('returns refined instruction when Codex emits instruction tag', async () => {
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

    const service = new CodexInstructionRefineService(plugin);

    setImmediate(() => {
      child.stdout.write(JSON.stringify({
        type: 'thread.started',
        thread_id: 'thread-1',
      }) + '\n');
      child.stdout.write(JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: '<instruction>Refined instruction</instruction>' },
      }) + '\n');
      child.stdout.end();
      child.stderr.end();
      child.emit('exit', 0, null);
    });

    const result = await service.refineInstruction('raw', 'existing');

    expect(result).toEqual({ success: true, refinedInstruction: 'Refined instruction' });
  });
});
