import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const repoAssetsDir = fileURLToPath(new URL('../../assets', import.meta.url));
const docsPublicDir = fileURLToPath(new URL('./public', import.meta.url));

function syncBossRaidFavicon(): Plugin {
  return {
    name: 'sync-boss-raid-favicon',
    buildStart() {
      copyFileSync(
        resolve(repoAssetsDir, 'boss-raid-pfp.png'),
        resolve(docsPublicDir, 'boss-raid-pfp.png')
      );
    },
  };
}

function readThemeFontSnippet(): string {
  const snippetPath = resolve(__dirname, 'src/lib/generated/papers-theme-fonts.html');
  if (!existsSync(snippetPath)) {
    return '';
  }
  return readFileSync(snippetPath, 'utf8').trim();
}

export default defineConfig({
  plugins: [
    syncBossRaidFavicon(),
    react(),
    {
      name: 'papers-theme-fonts',
      transformIndexHtml(html) {
        const fonts = readThemeFontSnippet();
        if (!fonts) {
          return html;
        }
        return html.replace('</head>', `${fonts}\n  </head>`);
      },
    },
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@app-shared': resolve(__dirname, './shared'),
      '@assets': repoAssetsDir,
    },
  },
  css: {
    devSourcemap: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    cssMinify: true,
    minify: 'esbuild',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react-syntax-highlighter')) {
              return 'vendor-syntax';
            }
            if (id.includes('marked')) {
              return 'vendor-markdown';
            }
            if (id.includes('framer-motion')) {
              return 'vendor-motion';
            }
            if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) {
              return 'vendor-react';
            }
            if (id.includes('react-router')) {
              return 'vendor-router';
            }
            if (id.includes('@iconify')) {
              return 'vendor-iconify';
            }
            if (id.includes('dompurify')) {
              return 'vendor-sanitize';
            }
            if (id.includes('mermaid')) {
              return 'vendor-mermaid';
            }
          }
        },
      },
    },
  },
  esbuild: {
    drop: ['console', 'debugger'],
    pure: ['console.log', 'console.info', 'console.debug'],
  },
  server: {
    port: 3333,
    open: false,
  },
  preview: {
    port: 3333,
  },
});
