import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  return {
    // Root for Docker/Render; GitHub Pages sets VITE_BASE_PATH=/delis-tg/
    // in its build workflow. Public assets and the PWA manifest stay portable.
    base: env.VITE_BASE_PATH || "/",
    plugins: [react(), tailwindcss(), viteSingleFile()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    server: {
      host: "0.0.0.0",
      allowedHosts: [".e2b.app", ".preview.app"],
      /* Dev/preview: browser calls /v1/... same-origin (VITE_API_URL="/") and
         Vite forwards them to the local API — no cross-origin issues from the
         user's browser (mirrors the production single-image setup). */
      proxy: {
        "/v1": {
          target: env.VITE_DEV_API_PROXY_TARGET || "http://127.0.0.1:3001",
          changeOrigin: true,
        },
        "/health": {
          target: env.VITE_DEV_API_PROXY_TARGET || "http://127.0.0.1:3001",
          changeOrigin: true,
        },
      },
    },
  };
});
