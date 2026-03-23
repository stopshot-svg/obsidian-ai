import * as fs from 'fs';
import * as os from 'os';

import { CodexCliResolver, resolveCodexCliPath } from '@/utils/codexCli';

jest.mock('fs');
jest.mock('os');

const mockedExists = fs.existsSync as jest.Mock;
const mockedStat = fs.statSync as jest.Mock;
const mockedHostname = os.hostname as jest.Mock;

describe('CodexCliResolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedHostname.mockReturnValue('test-host');
  });

  it('uses hostname-specific path when configured', () => {
    mockedExists.mockImplementation((p: string) => p === '/hostname/codex');
    mockedStat.mockReturnValue({ isFile: () => true });

    const resolver = new CodexCliResolver();
    const resolved = resolver.resolve({ 'test-host': '/hostname/codex' }, '/legacy/codex', '');

    expect(resolved).toBe('/hostname/codex');
  });

  it('falls back to legacy path when hostname path is missing', () => {
    mockedExists.mockImplementation((p: string) => p === '/legacy/codex');
    mockedStat.mockReturnValue({ isFile: () => true });

    const resolver = new CodexCliResolver();
    const resolved = resolver.resolve({ other: '/other/codex' }, '/legacy/codex', '');

    expect(resolved).toBe('/legacy/codex');
  });

  it('uses cached result until inputs change', () => {
    mockedExists.mockImplementation((p: string) => p === '/hostname/codex');
    mockedStat.mockReturnValue({ isFile: () => true });

    const resolver = new CodexCliResolver();
    const first = resolver.resolve({ 'test-host': '/hostname/codex' }, '', '');
    const second = resolver.resolve({ 'test-host': '/hostname/codex' }, '', '');

    expect(first).toBe('/hostname/codex');
    expect(second).toBe('/hostname/codex');
    expect(mockedExists).toHaveBeenCalledTimes(1);
  });
});

describe('resolveCodexCliPath', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns hostname path when it points to a file', () => {
    mockedExists.mockImplementation((p: string) => p === '/hostname/codex');
    mockedStat.mockReturnValue({ isFile: () => true });

    expect(resolveCodexCliPath('/hostname/codex', '/legacy/codex', '')).toBe('/hostname/codex');
  });

  it('returns legacy path when hostname path is not a file', () => {
    mockedExists.mockImplementation((p: string) => p === '/hostname/codex' || p === '/legacy/codex');
    mockedStat.mockImplementation((p: string) => ({ isFile: () => p !== '/hostname/codex' }));

    expect(resolveCodexCliPath('/hostname/codex', '/legacy/codex', '')).toBe('/legacy/codex');
  });
});
