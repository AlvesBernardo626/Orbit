const localHosts = new Set(['localhost', '127.0.0.1', '::1']);

function apiOrigin(apiUrl: string) {
  try {
    return new URL(apiUrl).origin;
  } catch {
    return apiUrl;
  }
}

export async function readJsonResponse<T>(response: Response, apiUrl: string): Promise<T> {
  const body = await response.text();
  try {
    return JSON.parse(body) as T;
  } catch {
    const origin = apiOrigin(apiUrl);
    const html = /^\s*(?:<!doctype|<html)/i.test(body);
    throw new Error(
      html
        ? `O endereço ${origin} respondeu uma página HTML em vez da API do Orbit (HTTP ${response.status}). Instale a versão mais recente do aplicativo ou contate o administrador.`
        : `O servidor do Orbit em ${origin} retornou uma resposta inválida (HTTP ${response.status}).`,
    );
  }
}

export function friendlyNetworkError(error: unknown, apiUrl: string) {
  const raw = error instanceof Error ? error.message : String(error);
  let origin = apiUrl;
  let hostname = apiUrl;
  try {
    const url = new URL(apiUrl);
    origin = apiOrigin(apiUrl);
    hostname = url.hostname;
  } catch {
    // The build validates this value; retain it only to make a malformed development config clear.
  }
  if (raw.includes('ERR_NAME_NOT_RESOLVED'))
    return new Error(
      `Não foi possível localizar o servidor do Orbit (${hostname}). Este aplicativo foi gerado com uma VITE_API_URL inválida ou indisponível.`,
    );
  if (raw.includes('ERR_CONNECTION_REFUSED') || raw.includes('Failed to fetch'))
    return new Error(
      localHosts.has(hostname)
        ? `A API local do Orbit não está em execução em ${origin}. Inicie o servidor com npm run dev.`
        : `Não foi possível conectar ao servidor do Orbit em ${origin}. Tente novamente ou contate o administrador.`,
    );
  if (raw.includes('ERR_INTERNET_DISCONNECTED'))
    return new Error('Sem conexão com a internet. Conecte-se e tente novamente.');
  if (raw.includes('ERR_TIMED_OUT') || raw.includes('TimeoutError'))
    return new Error(`O servidor do Orbit em ${origin} demorou demais para responder.`);
  return error instanceof Error ? error : new Error('Falha de rede ao acessar o Orbit.');
}
