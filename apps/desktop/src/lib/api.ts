import type { AuthResult, Session } from '@orbit/shared';
export const API = import.meta.env.VITE_API_URL as string;
let session: Session | null = null;
let browserRefresh: string | null = null;
let refreshPromise: Promise<Session | null> | null = null;
const listeners = new Set<() => void>();
export const authStore = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  snapshot: () => session,
};
function publish(next: Session | null) {
  session = next;
  listeners.forEach((fn) => fn());
  return next;
}
async function action(
  action: 'login' | 'register' | 'refresh' | 'logout',
  data?: unknown,
): Promise<Session | null> {
  if (window.orbit) return window.orbit.auth(action, data);
  if (import.meta.env.PROD) throw new Error('Abra o Orbit pelo aplicativo desktop');
  if (action === 'logout') {
    if (session)
      await fetch(`${API}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}` },
      }).catch(() => undefined);
    browserRefresh = null;
    return null;
  }
  if (action === 'refresh' && !browserRefresh) return null;
  const response = await fetch(`${API}/api/auth/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action === 'refresh' ? { refreshToken: browserRefresh } : data),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) browserRefresh = null;
    throw new ApiError(response.status, result.error ?? 'Falha na autenticação');
  }
  const auth = result as AuthResult;
  browserRefresh = auth.refreshToken;
  return { accessToken: auth.accessToken, user: auth.user };
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function signIn(actionName: 'login' | 'register', data: unknown) {
  return publish(await action(actionName, data));
}
export async function signOut() {
  try {
    await action('logout');
  } finally {
    publish(null);
  }
}
export async function renew() {
  if (!refreshPromise)
    refreshPromise = action('refresh')
      .then(publish)
      .finally(() => {
        refreshPromise = null;
      });
  return refreshPromise;
}
export async function token() {
  if (!session) await renew();
  if (session) {
    const exp = JSON.parse(atob(session.accessToken.split('.')[1]!)).exp as number;
    if (exp * 1000 - Date.now() < 60000) await renew();
  }
  if (!session) throw new ApiError(401, 'Entre novamente');
  return session.accessToken;
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const request = async () =>
    fetch(`${API}/api${path}`, {
      method: options.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal ?? AbortSignal.timeout(15000),
    });
  let response = await request();
  if (response.status === 401) {
    try {
      await renew();
    } catch {
      publish(null);
      throw new ApiError(401, 'Sessão expirada');
    }
    response = await request();
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(response.status, data.error ?? 'Falha na conexão');
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export const mutation = <T>(path: string, body?: unknown, method = 'POST') =>
  api<T>(path, { method, body });
