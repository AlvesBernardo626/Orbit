import { resolve } from 'node:path';
import { loadEnv } from 'vite';

const root = resolve(import.meta.dirname, '../../..');
const env = loadEnv('production', root, '');
const api = env.VITE_API_URL?.trim();
const update = env.ORBIT_UPDATE_URL?.trim();

if (!api) throw new Error('Defina VITE_API_URL com a URL HTTPS pública da API do Orbit.');

let url;
try {
  url = new URL(api);
} catch {
  throw new Error(`VITE_API_URL não é uma URL válida: ${api}`);
}

const hostname = url.hostname.toLowerCase();
const placeholder =
  hostname === 'example.com' ||
  hostname.endsWith('.example.com') ||
  hostname.endsWith('.example') ||
  hostname.endsWith('.invalid') ||
  hostname.endsWith('.test') ||
  hostname === 'localhost' ||
  hostname === '127.0.0.1' ||
  hostname === '::1' ||
  hostname.includes('seu-servico');

if (url.protocol !== 'https:' || placeholder)
  throw new Error(
    `VITE_API_URL precisa apontar para a API HTTPS pública real do Orbit; recebido: ${api}`,
  );
if (url.username || url.password || url.search || url.hash || api !== url.origin)
  throw new Error(
    'VITE_API_URL deve conter somente a origem HTTPS, sem credenciais, caminho ou query.',
  );

if (!update) throw new Error('Defina ORBIT_UPDATE_URL com a rota pública /downloads da API.');
let updateUrl;
try {
  updateUrl = new URL(update);
} catch {
  throw new Error(`ORBIT_UPDATE_URL não é uma URL válida: ${update}`);
}
if (
  updateUrl.protocol !== 'https:' ||
  updateUrl.username ||
  updateUrl.password ||
  updateUrl.search ||
  updateUrl.hash ||
  updateUrl.toString().replace(/\/$/, '') !== `${url.origin}/downloads`
)
  throw new Error(
    `ORBIT_UPDATE_URL deve ser exatamente ${url.origin}/downloads para receber atualizações seguras.`,
  );

console.log(`Release validada: API ${url.origin}; atualizações ${url.origin}/downloads`);
