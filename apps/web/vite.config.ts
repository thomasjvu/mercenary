import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const packageEnv = loadEnv(mode, process.cwd(), "");
  const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
  const rootEnv = loadEnv(mode, repoRoot, "");
  const apiTarget =
    process.env.VITE_BOSSRAID_API_BASE ||
    process.env.BOSSRAID_API_ORIGIN ||
    packageEnv.VITE_BOSSRAID_API_BASE ||
    rootEnv.VITE_BOSSRAID_API_BASE ||
    rootEnv.BOSSRAID_API_ORIGIN ||
    "http://127.0.0.1:8787";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@bossraid/ui": fileURLToPath(new URL("../../packages/ui/src/index.tsx", import.meta.url)),
      },
    },
    envDir: resolve(repoRoot),
    server: {
      port: 4173,
      host: "127.0.0.1",
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
});
