import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_BOSSRAID_API_BASE || "http://127.0.0.1:8787";
  const base = env.VITE_BOSSRAID_OPS_BASE_PATH || "/ops/";

  return {
    base,
    plugins: [react()],
    resolve: {
      alias: {
        "@bossraid/ui": fileURLToPath(new URL("../../packages/ui/src/index.tsx", import.meta.url)),
      },
    },
    server: {
      port: 4174,
      host: "127.0.0.1",
      proxy: {
        "/ops-api": {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ops-api/, ""),
        },
      },
    },
  };
});
