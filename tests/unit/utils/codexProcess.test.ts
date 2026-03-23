describe('createCodexSpawnSpec', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('uses powershell.exe for .ps1 on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const { createCodexSpawnSpec } = await import('@/utils/codexProcess');

    const spec = createCodexSpawnSpec(
      'C:\\Users\\Administrator\\AppData\\Roaming\\npm\\codex.ps1',
      ['exec', '--experimental-json'],
      { cwd: 'C:\\vault' }
    );

    expect(spec.command).toBe('powershell.exe');
    expect(spec.args).toEqual([
      '-NoLogo',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      'C:\\Users\\Administrator\\AppData\\Roaming\\npm\\codex.ps1',
      'exec',
      '--experimental-json',
    ]);
  });

  it('uses cmd.exe for .cmd on Windows', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const { createCodexSpawnSpec } = await import('@/utils/codexProcess');

    const spec = createCodexSpawnSpec(
      'C:\\Users\\Administrator\\AppData\\Roaming\\npm\\codex.cmd',
      ['exec', '--cd', 'C:\\My Vault'],
      { cwd: 'C:\\vault' }
    );

    expect(spec.command).toBe('cmd.exe');
    expect(spec.args.slice(0, 3)).toEqual(['/d', '/s', '/c']);
    expect(spec.args[3]).toContain('codex.cmd');
    expect(spec.args[3]).toContain('"C:\\My Vault"');
  });
});
