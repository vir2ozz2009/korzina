import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { bundleReport } from "./scripts/bundle-report.ts";

export default defineConfig(({ mode }) => ({
  plugins: [
    cloudflare(),
    react(),
    tailwindcss(),
    bundleReport(),
    {
      name: "build-revision",
      transformIndexHtml: () => [
        {
          tag: "meta",
          attrs: {
            name: "build-revision",
            content: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
          },
          injectTo: "head",
        },
      ],
    },
  ],
  define: {
    "import.meta.env.DEV_SCREENS": mode !== "production",
    "import.meta.env.SHOW_UNFINISHED": mode !== "production",
  },
  build: {
    target: "es2022",
    modulePreload: { polyfill: false },
    rolldownOptions: {
      output: {
        codeSplitting: {
          // The budget measures entry + home together. Keep that graph in one
          // entry chunk so shared UI/query/router code is compressed together.
          groups: [
            {
              name: "index",
              test: (id) =>
                /\/src\/app\/main\.tsx$|\/src\/features\/catalog\/ui\/HomeScreen\.tsx$|\/index\.html$/.test(id),
            },
          ],
        },
      },
    },
  },
  optimizeDeps: { include: ["libheif-js/libheif-wasm/libheif.js"] },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
}));
