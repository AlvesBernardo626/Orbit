import {
  app,
  BrowserWindow,
  protocol,
  net,
  ipcMain,
  safeStorage,
  session,
  desktopCapturer,
  shell,
  systemPreferences,
  dialog,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import { readFile, writeFile, unlink, rename } from 'node:fs/promises';
import { join, resolve, extname, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loginSchema, registerSchema } from '@orbit/shared';
import { friendlyNetworkError } from '../src/lib/networkErrors';
const appId = 'app.orbit.desktop';
const api = process.env.ORBIT_API_URL!;
const dev = process.env.ORBIT_DEV_URL;
const osVersion = process.getSystemVersion();
const [osMajor = 0, osMinor = 0] = osVersion.split('.').map(Number);
const systemAudio =
  process.platform === 'win32' ||
  (process.platform === 'darwin' &&
    app.isPackaged &&
    (osMajor > 14 || (osMajor === 14 && osMinor >= 2)));
type MediaPermission = 'microphone' | 'screen';
type SettingsPermission = MediaPermission | 'notifications';
type PermissionStatus = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';
const mediaStatus = (permission: MediaPermission): PermissionStatus =>
  process.platform === 'darwin' || process.platform === 'win32'
    ? systemPreferences.getMediaAccessStatus(permission)
    : 'unknown';
const runtimeInfo = () => ({
  appId,
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  osVersion,
  isPackaged: app.isPackaged,
  systemAudio,
  permissions: {
    microphone: mediaStatus('microphone'),
    screen: mediaStatus('screen'),
  },
});
const permissionMessage = (permission: MediaPermission) => {
  if (process.platform === 'darwin') {
    const label = permission === 'microphone' ? 'Microfone' : 'Gravação de Tela';
    return `O Orbit não tem acesso a ${permission === 'microphone' ? 'seu microfone' : 'sua tela'}. Abra Ajustes do Sistema > Privacidade e Segurança > ${label}, habilite o Orbit e reinicie o aplicativo.`;
  }
  if (permission === 'microphone' && process.platform === 'win32')
    return 'O Orbit não tem acesso ao microfone. Abra Configurações > Privacidade e segurança > Microfone e permita o acesso para aplicativos da área de trabalho.';
  return `Permissão de ${permission === 'microphone' ? 'microfone' : 'captura de tela'} indisponível.`;
};
const settingsUrls: Partial<Record<NodeJS.Platform, Record<SettingsPermission, string>>> = {
  darwin: {
    microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
    screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
    notifications: 'x-apple.systempreferences:com.apple.Notifications-Settings.extension',
  },
  win32: {
    microphone: 'ms-settings:privacy-microphone',
    screen: 'ms-settings:privacy',
    notifications: 'ms-settings:notifications',
  },
};
if (!api || (app.isPackaged && new URL(api).protocol !== 'https:'))
  throw new Error('API segura deve ser configurada no build');
app.setName('Orbit');
if (process.platform === 'win32') app.setAppUserModelId(appId);
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
let updateTimer: NodeJS.Timeout | undefined;
const trusted = (url: string) =>
  app.isPackaged
    ? url.startsWith('orbit://app/')
    : Boolean(dev && new URL(url).origin === new URL(dev).origin);
const tokenFile = () => join(app.getPath('userData'), 'session.enc');
async function fetchApi(path: string, init: RequestInit) {
  try {
    return await net.fetch(`${api}${path}`, init);
  } catch (error) {
    throw friendlyNetworkError(error, api);
  }
}
async function saveToken(token: string) {
  if (!safeStorage.isEncryptionAvailable())
    throw new Error('Armazenamento seguro do sistema indisponível');
  const temp = tokenFile() + '.tmp';
  await writeFile(temp, safeStorage.encryptString(token), { mode: 0o600 });
  await rename(temp, tokenFile());
}
function configureAutoUpdates() {
  if (!app.isPackaged || !['darwin', 'win32'].includes(process.platform)) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.on('error', (error) => {
    console.error('Falha ao verificar atualização do Orbit:', error.message);
  });
  autoUpdater.on('update-downloaded', (info) => {
    void dialog
      .showMessageBox(win, {
        type: 'info',
        title: 'Atualização pronta',
        message: `Orbit ${info.version} foi baixado.`,
        detail:
          'Reinicie agora para aplicar a atualização ou continue e ela será instalada ao sair.',
        buttons: ['Reiniciar agora', 'Mais tarde'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
  });
  const check = () => {
    void autoUpdater.checkForUpdates().catch((error: unknown) => {
      console.error(
        'Não foi possível consultar atualizações do Orbit:',
        error instanceof Error ? error.message : error,
      );
    });
  };
  setTimeout(check, 10000).unref();
  updateTimer = setInterval(check, 4 * 60 * 60 * 1000);
  updateTimer.unref();
}
async function auth(action: string, data: unknown) {
  if (action !== 'logout' && !safeStorage.isEncryptionAvailable())
    throw new Error('Armazenamento seguro indisponível');
  if (action === 'logout') {
    try {
      if (accessToken)
        await fetchApi('/api/auth/logout', {
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
  const response = await fetchApi(`/api/auth/${action}`, {
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
    return runtimeInfo();
  });
  ipcMain.handle('permissions:request-microphone', async (event) => {
    check(event);
    if (process.platform === 'darwin' && mediaStatus('microphone') === 'not-determined')
      await systemPreferences.askForMediaAccess('microphone');
    return mediaStatus('microphone');
  });
  ipcMain.handle('permissions:open-settings', async (event, permission: unknown) => {
    check(event);
    if (!['microphone', 'screen', 'notifications'].includes(String(permission)))
      throw new Error('Permissão inválida');
    const url = settingsUrls[process.platform]?.[permission as SettingsPermission];
    if (!url) throw new Error('Atalho de configurações indisponível neste sistema');
    await shell.openExternal(url);
  });
  ipcMain.handle('capture:sources', async (event) => {
    check(event);
    if (process.platform === 'darwin' && ['denied', 'restricted'].includes(mediaStatus('screen')))
      throw new Error(permissionMessage('screen'));
    const sources = await desktopCapturer
      .getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
      })
      .catch((error: unknown) => {
        if (process.platform === 'darwin' && mediaStatus('screen') !== 'granted')
          throw new Error(permissionMessage('screen'));
        throw error;
      });
    if (process.platform === 'darwin' && mediaStatus('screen') !== 'granted')
      throw new Error(permissionMessage('screen'));
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
    }));
  });
  ipcMain.handle('capture:select', async (event, id, audio) => {
    check(event);
    if (typeof id !== 'string' || typeof audio !== 'boolean') throw new Error('Fonte inválida');
    capture = { id, audio, expires: Date.now() + 15000 };
  });
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    const mediaTypes = 'mediaTypes' in details ? details.mediaTypes : undefined;
    callback(
      wc === win.webContents &&
        trusted(wc.getURL()) &&
        ['media', 'display-capture', 'speaker-selection', 'notifications'].includes(permission) &&
        (permission !== 'media' ||
          Boolean(mediaTypes?.length && mediaTypes.every((type) => type === 'audio'))),
    );
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission, _origin, details) =>
    Boolean(
      wc === win.webContents &&
      trusted(wc.getURL()) &&
      ['media', 'display-capture', 'speaker-selection', 'notifications'].includes(permission) &&
      (permission !== 'media' || details.mediaType === 'audio'),
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
  configureAutoUpdates();
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  if (updateTimer) clearInterval(updateTimer);
});
