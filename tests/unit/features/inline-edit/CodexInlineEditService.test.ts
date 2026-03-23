import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

import { CodexInlineEditService } from '@/features/inline-edit/CodexInlineEditService';

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

describe('CodexInlineEditService', () => {
  it('parses replacement text from Codex output', async () => {
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

    const service = new CodexInlineEditService(plugin);

    setImmediate(() => {
      child.stdout.write(JSON.stringify({
        type: 'thread.started',
        thread_id: 'thread-1',
      }) + '\n');
      child.stdout.write(JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: '<replacement>Updated text</replacement>' },
      }) + '\n');
      child.stdout.end();
      child.stderr.end();
      child.emit('exit', 0, null);
    });

    const result = await service.editText({
      mode: 'selection',
      instruction: 'Rewrite this',
      notePath: 'note.md',
      selectedText: 'Old text',
    });

    expect(result).toEqual({ success: true, editedText: 'Updated text' });
  });
});
