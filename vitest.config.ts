import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: [
      'apps/server/src/**/*.test.ts',
      'apps/desktop/src/**/*.test.ts',
      'packages/shared/src/**/*.test.ts',
    ],
    testTimeout: 30000,
    hookTimeout: 120000,
    fileParallelism: false,
  },
  resolve: {
    alias: { '@orbit/shared': new URL('./packages/shared/src/index.ts', import.meta.url).pathname },
  },
});
