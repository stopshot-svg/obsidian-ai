import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { buildCodexExecEnv } from '@/utils/codexEnv';

describe('buildCodexExecEnv', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('preserves explicit CODEX_HOME from environmentVariables', () => {
    const env = buildCodexExecEnv('CODEX_HOME=/custom/codex-home');

    expect(env.CODEX_HOME).toBe('/custom/codex-home');
    expect(env.GIT_TERMINAL_PROMPT).toBe('0');
  });

  it('falls back to ~/.paolu-codex when present', () => {
    const fallback = path.join(os.homedir(), '.paolu-codex');
    jest.spyOn(fs, 'existsSync').mockImplementation((input) => input === fallback);
    jest.spyOn(fs, 'statSync').mockImplementation((input) => ({
      isDirectory: () => input === fallback,
    }) as fs.Stats);

    const env = buildCodexExecEnv('');

    expect(env.CODEX_HOME).toBe(fallback);
    expect(env.GIT_TERMINAL_PROMPT).toBe('0');
  });
});
