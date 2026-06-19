import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { NETWORK } from '@bossraid/constants';

const repoAssetsDir = fileURLToPath(new URL('../../assets', import.meta.url));
const repoSkillPath = fileURLToPath(new URL('../../content/skill.md', import.meta.url));
const webPublicDir = fileURLToPath(new URL('./public', import.meta.url));

function syncBossRaidPublicAssets(): Plugin {
  return {
    name: 'sync-boss-raid-public-assets',
    buildStart() {
      copyFileSync(
        resolve(repoAssetsDir, 'boss-raid-pfp.png'),
        resolve(webPublicDir, 'boss-raid-pfp.png')
      );
      copyFileSync(repoSkillPath, resolve(webPublicDir, 'skill.md'));
    },
  };
}

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
    plugins: [syncBossRaidPublicAssets(), react()],
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
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('@bossraid/smart-pay') || id.includes('viem')) {
                return 'wallet';
              }
              if (id.includes('@iconify')) {
                return 'icons';
              }
            }
          },
        },
      },
    },
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
