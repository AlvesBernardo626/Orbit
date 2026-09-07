import { _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const profile = await mkdtemp(join(tmpdir(), 'orbit-electron-test-'));
const executablePath = process.env.ORBIT_ELECTRON_EXECUTABLE;
const app = await electron.launch({
  ...(executablePath ? { executablePath: resolve(executablePath) } : {}),
  args: [...(executablePath ? [] : [resolve('apps/desktop')]), `--user-data-dir=${profile}`],
});
try {
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Entrar no Orbit' }).waitFor();
  const result = await window.evaluate(async () => ({
    bridge: typeof window.orbit?.auth,
    settingsBridge: typeof window.orbit?.openSystemSettings,
    runtime: await window.orbit?.capabilities(),
    require: typeof window.require,
    node: typeof window.process,
  }));
  if (result.bridge !== 'function' || result.require !== 'undefined' || result.node !== 'undefined')
    throw new Error('Renderer isolation check failed');
  if (
    result.settingsBridge !== 'function' ||
    result.runtime?.appId !== 'app.orbit.desktop' ||
    result.runtime?.platform !== process.platform ||
    result.runtime?.arch !== process.arch ||
    !result.runtime.version
  )
    throw new Error('Runtime platform bridge check failed');
  const prefs = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
  );
  if (!prefs.contextIsolation || !prefs.sandbox || prefs.nodeIntegration)
    throw new Error('Unsafe Electron preferences');
  await window.screenshot({ path: 'test-results/orbit-electron.png' });
  console.log(
    'Electron: login renderiza; bridge disponível; sandbox/contextIsolation ativos; Node não exposto.',
  );
} finally {
  await app.close();
  await rm(profile, { recursive: true, force: true });
}
