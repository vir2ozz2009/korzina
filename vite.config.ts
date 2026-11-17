import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { bundleReport } from "./scripts/bundle-report.ts";

export default defineConfig(({ mode }) => ({
  plugins: [cloudflare(), react(), tailwindcss(), bundleReport()],
  define: { "import.meta.env.DEV_SCREENS": mode !== "production" },
  build: {
    target: "es2022",
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "router",
              test: /node_modules\/@tanstack\/(?:react-router|router-core|history|react-store|store)\//,
            },
            { name: "query", test: /node_modules\/@tanstack\/(?:react-query|query-core)\// },
          ],
        },
      },
    },
  },
  optimizeDeps: { include: ["libheif-js/libheif-wasm/libheif.js"] },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
}));
