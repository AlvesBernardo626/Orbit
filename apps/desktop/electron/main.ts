import {
  app,
  BrowserWindow,
  protocol,
  net,
  ipcMain,
  safeStorage,
  session,
  desktopCapturer,
} from 'electron';
import { readFile, writeFile, unlink, rename } from 'node:fs/promises';
import { join, resolve, extname, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loginSchema, registerSchema } from '@orbit/shared';
const api = process.env.ORBIT_API_URL!;
const dev = process.env.ORBIT_DEV_URL;
const [osMajor = 0, osMinor = 0] = process.getSystemVersion().split('.').map(Number);
const systemAudio =
  process.platform === 'win32' ||
  (process.platform === 'darwin' &&
    app.isPackaged &&
    (osMajor > 14 || (osMajor === 14 && osMinor >= 2)));
if (!api || (app.isPackaged && new URL(api).protocol !== 'https:'))
  throw new Error('API segura deve ser configurada no build');
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'orbit',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);
app.enableSandbox();
let win: BrowserWindow;
let capture: { id: string; audio: boolean; expires: number } | undefined;
let accessToken = '';
let authQueue: Promise<unknown> = Promise.resolve();
const trusted = (url: string) =>
  app.isPackaged
    ? url.startsWith('orbit://app/')
    : Boolean(dev && new URL(url).origin === new URL(dev).origin);
const tokenFile = () => join(app.getPath('userData'), 'session.enc');
async function saveToken(token: string) {
  if (!safeStorage.isEncryptionAvailable())
    throw new Error('Armazenamento seguro do sistema indisponível');
  const temp = tokenFile() + '.tmp';
  await writeFile(temp, safeStorage.encryptString(token), { mode: 0o600 });
  await rename(temp, tokenFile());
}
async function auth(action: string, data: unknown) {
  if (action !== 'logout' && !safeStorage.isEncryptionAvailable())
    throw new Error('Armazenamento seguro indisponível');
  if (action === 'logout') {
    try {
      if (accessToken)
        await net.fetch(`${api}/api/auth/logout`, {
          method: 'POST',
          signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Bearer ${accessToken}` },
        });
    } finally {
      accessToken = '';
      await unlink(tokenFile()).catch(() => undefined);
    }
    return null;
  }
  let body: unknown;
  if (action === 'login') body = loginSchema.parse(data);
  else if (action === 'register') body = registerSchema.parse(data);
  else if (action === 'refresh') {
    try {
      body = { refreshToken: safeStorage.decryptString(await readFile(tokenFile())) };
    } catch {
      return null;
    }
  } else throw new Error('Ação inválida');
  const response = await net.fetch(`${api}/api/auth/${action}`, {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) {
    if (action === 'refresh' && response.status === 401) {
      await unlink(tokenFile()).catch(() => undefined);
      accessToken = '';
      return null;
    }
    throw new Error(result.error ?? 'Falha de autenticação');
  }
  await saveToken(result.refreshToken);
  accessToken = result.accessToken;
  return { accessToken, user: result.user };
}
app.whenReady().then(async () => {
  protocol.handle('orbit', (request) => {
    const url = new URL(request.url);
    const root = resolve(__dirname, '../dist');
    let path = resolve(root, '.' + decodeURIComponent(url.pathname));
    const local = relative(root, path);
    if (url.host !== 'app' || local.startsWith('..') || isAbsolute(local))
      return new Response('Forbidden', { status: 403 });
    if (!extname(path)) path = join(root, 'index.html');
    return net.fetch(pathToFileURL(path).toString());
  });
  win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 980,
    minHeight: 700,
    backgroundColor: '#101713',
    title: 'Orbit',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (!trusted(url)) event.preventDefault();
  });
  const check = (event: Electron.IpcMainInvokeEvent) => {
    if (
      event.sender !== win.webContents ||
      event.senderFrame !== win.webContents.mainFrame ||
      !trusted(event.senderFrame.url)
    )
      throw new Error('Origem IPC inválida');
  };
  ipcMain.handle('auth', (event, action, data) => {
    check(event);
    const next = authQueue.then(() => auth(action, data));
    authQueue = next.catch(() => undefined);
    return next;
  });
  ipcMain.handle('capture:capabilities', (event) => {
    check(event);
    return { systemAudio };
  });
  ipcMain.handle('capture:sources', async (event) => {
    check(event);
    return (
      await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
      })
    ).map((s) => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL() }));
  });
  ipcMain.handle('capture:select', async (event, id, audio) => {
    check(event);
    if (typeof id !== 'string' || typeof audio !== 'boolean') throw new Error('Fonte inválida');
    capture = { id, audio, expires: Date.now() + 15000 };
  });
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) =>
    callback(
      wc === win.webContents &&
        trusted(wc.getURL()) &&
        ['media', 'display-capture', 'speaker-selection'].includes(permission) &&
        (permission !== 'media' ||
          !('mediaTypes' in details) ||
          !details.mediaTypes?.includes('video')),
    ),
  );
  session.defaultSession.setPermissionCheckHandler((wc, permission, _origin, details) =>
    Boolean(
      wc === win.webContents &&
      trusted(wc.getURL()) &&
      ['media', 'display-capture', 'speaker-selection'].includes(permission) &&
      (permission !== 'media' || details.mediaType !== 'video'),
    ),
  );
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    const selection = capture;
    capture = undefined;
    if (
      !request.frame ||
      request.frame !== win.webContents.mainFrame ||
      !trusted(request.frame.url) ||
      !selection ||
      selection.expires < Date.now()
    ) {
      callback({});
      return;
    }
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 0, height: 0 },
      });
      const source = sources.find((s) => s.id === selection.id);
      if (!source) {
        callback({});
        return;
      }
      callback({
        video: source,
        ...(selection.audio && systemAudio ? { audio: 'loopback' as const } : {}),
      });
    } catch {
      callback({});
    }
  });
  await win.loadURL(app.isPackaged ? 'orbit://app/index.html' : dev!);
});
app.on('window-all-closed', () => app.quit());
