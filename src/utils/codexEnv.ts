import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { parseEnvironmentVariables } from './env';

const FALLBACK_CODEX_HOME_DIR = path.join(os.homedir(), '.paolu-codex');

export function buildCodexExecEnv(envText: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const customEnv = parseEnvironmentVariables(envText || '');

  for (const [key, value] of Object.entries(customEnv)) {
    env[key] = value;
  }

  if (!env.CODEX_HOME) {
    try {
      if (fs.existsSync(FALLBACK_CODEX_HOME_DIR) && fs.statSync(FALLBACK_CODEX_HOME_DIR).isDirectory()) {
        env.CODEX_HOME = FALLBACK_CODEX_HOME_DIR;
      }
    } catch {
      // Ignore discovery errors and keep existing environment.
    }
  }

  env.GIT_TERMINAL_PROMPT = '0';
  return env;
}
