import { _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const profile = await mkdtemp(join(tmpdir(), 'orbit-electron-test-'));
const app = await electron.launch({
  args: [resolve('apps/desktop'), `--user-data-dir=${profile}`],
});
try {
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Entrar no Orbit' }).waitFor();
  const result = await window.evaluate(() => ({
    bridge: typeof window.orbit?.auth,
    require: typeof window.require,
    node: typeof window.process,
  }));
  if (result.bridge !== 'function' || result.require !== 'undefined' || result.node !== 'undefined')
    throw new Error('Renderer isolation check failed');
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
