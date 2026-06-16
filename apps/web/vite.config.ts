import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { NETWORK } from '@bossraid/constants';

export default defineConfig(({ mode }) => {
  const packageEnv = loadEnv(mode, process.cwd(), '');
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  const rootEnv = loadEnv(mode, repoRoot, '');
  const apiTarget =
    process.env.VITE_BOSSRAID_API_BASE ||
    process.env.BOSSRAID_API_ORIGIN ||
    packageEnv.VITE_BOSSRAID_API_BASE ||
    rootEnv.VITE_BOSSRAID_API_BASE ||
    rootEnv.BOSSRAID_API_ORIGIN ||
    `http://${NETWORK.LOCALHOST}:${NETWORK.LOCAL_API_PORT}`;

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@assets': fileURLToPath(new URL('../../assets', import.meta.url)),
        '@bossraid/ui': fileURLToPath(new URL('../../packages/ui/src/index.tsx', import.meta.url)),
        '@bossraid/proof-ui': fileURLToPath(
          new URL('../../packages/proof-ui/src/index.ts', import.meta.url)
        ),
        '@bossraid/smart-pay': fileURLToPath(
          new URL('../../packages/smart-pay/src/index.ts', import.meta.url)
        ),
      },
    },
    envDir: resolve(repoRoot),
    server: {
      port: NETWORK.LOCAL_WEB_PORT,
      host: NETWORK.LOCALHOST,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  };
});
