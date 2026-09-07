import { createHash } from 'node:crypto';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../..', '');
  const api = env.VITE_API_URL;
  if (!api) throw new Error('Configure VITE_API_URL no .env da raiz');
  const origin = new URL(api).origin;
  const ws = origin.replace(/^http/, 'ws');
  return {
    envDir: '../..',
    base: './',
    plugins: [
      react(),
      ...(env.ORBIT_BROWSER_ONLY === 'true'
        ? []
        : [
            electron({
              main: {
                entry: 'electron/main.ts',
                vite: {
                  define: {
                    'process.env.ORBIT_API_URL': JSON.stringify(api),
                    'process.env.ORBIT_DEV_URL': JSON.stringify(env.DESKTOP_DEV_URL),
                  },
                  build: {
                    lib: false,
                    rolldownOptions: {
                      input: 'electron/main.ts',
                      output: { format: 'cjs', entryFileNames: 'main.cjs' },
                    },
                  },
                },
              },
              preload: {
                input: 'electron/preload.ts',
                vite: {
                  build: {
                    rolldownOptions: { output: { format: 'cjs', entryFileNames: 'preload.cjs' } },
                  },
                },
              },
            }),
          ]),
      {
        name: 'orbit-csp',
        transformIndexHtml: {
          order: 'post',
          handler(html) {
            // Hash Vite's development preamble; never permit arbitrary inline JavaScript.
            const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
              .filter((m) => m[1]?.trim())
              .map((m) => `'sha256-${createHash('sha256').update(m[1]!).digest('base64')}'`)
              .join(' ');
            const devWs =
              mode === 'development' && env.DESKTOP_DEV_URL
                ? ' ' + new URL(env.DESKTOP_DEV_URL).origin.replace(/^http/, 'ws')
                : '';
            return html.replace(
              '<head>',
              `<head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' ${hashes}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' ${origin} ${ws}${devWs}; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none';">`,
            );
          },
        },
      },
    ],
    server: env.DESKTOP_DEV_URL
      ? {
          host: new URL(env.DESKTOP_DEV_URL).hostname,
          port: Number(new URL(env.DESKTOP_DEV_URL).port),
          strictPort: true,
          hmr: env.ORBIT_E2E === 'true' ? false : undefined,
        }
      : undefined,
  };
});
