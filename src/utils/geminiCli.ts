import * as fs from 'fs';
import * as path from 'path';

import type { HostnameCliPaths } from '../core/types/settings';
import { getHostnameKey, parseEnvironmentVariables } from './env';
import { expandHomePath, parsePathEntries } from './path';

function findGeminiCLIPath(pathValue?: string): string | null {
  const entries = parsePathEntries(pathValue);
  const candidates = process.platform === 'win32'
    ? ['gemini.exe', 'gemini.cmd', 'gemini.ps1', 'gemini']
    : ['gemini'];

  for (const dir of entries) {
    for (const candidate of candidates) {
      const fullPath = path.join(dir, candidate);
      try {
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          return fullPath;
        }
      } catch {
        // Ignore inaccessible candidates and keep scanning.
      }
    }
  }

  return null;
}

export class GeminiCliResolver {
  private resolvedPath: string | null = null;
  private lastHostnamePath = '';
  private lastLegacyPath = '';
  private lastEnvText = '';
  private readonly cachedHostname = getHostnameKey();

  resolve(
    hostnamePaths: HostnameCliPaths | undefined,
    legacyPath: string | undefined,
    envText: string
  ): string | null {
    const hostnameKey = this.cachedHostname;
    const hostnamePath = (hostnamePaths?.[hostnameKey] ?? '').trim();
    const normalizedLegacy = (legacyPath ?? '').trim();
    const normalizedEnv = envText ?? '';

    if (
      this.resolvedPath &&
      hostnamePath === this.lastHostnamePath &&
      normalizedLegacy === this.lastLegacyPath &&
      normalizedEnv === this.lastEnvText
    ) {
      return this.resolvedPath;
    }

    this.lastHostnamePath = hostnamePath;
    this.lastLegacyPath = normalizedLegacy;
    this.lastEnvText = normalizedEnv;
    this.resolvedPath = resolveGeminiCliPath(hostnamePath, normalizedLegacy, normalizedEnv);
    return this.resolvedPath;
  }

  reset(): void {
    this.resolvedPath = null;
    this.lastHostnamePath = '';
    this.lastLegacyPath = '';
    this.lastEnvText = '';
  }
}

export function resolveGeminiCliPath(
  hostnamePath: string | undefined,
  legacyPath: string | undefined,
  envText: string
): string | null {
  const trimmedHostname = (hostnamePath ?? '').trim();
  if (trimmedHostname) {
    try {
      const expandedPath = expandHomePath(trimmedHostname);
      if (fs.existsSync(expandedPath) && fs.statSync(expandedPath).isFile()) {
        return expandedPath;
      }
    } catch {
      // Fall through to next resolution method.
    }
  }

  const trimmedLegacy = (legacyPath ?? '').trim();
  if (trimmedLegacy) {
    try {
      const expandedPath = expandHomePath(trimmedLegacy);
      if (fs.existsSync(expandedPath) && fs.statSync(expandedPath).isFile()) {
        return expandedPath;
      }
    } catch {
      // Fall through to auto-detect.
    }
  }

  const customEnv = parseEnvironmentVariables(envText || '');
  return findGeminiCLIPath(customEnv.PATH);
}
