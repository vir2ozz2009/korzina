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
    modulePreload: { polyfill: false },
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "router",
              test: /node_modules\/@tanstack\/(?:react-router|router-core|history|react-store|store)\//,
              minShareCount: 2,
            },
            { name: "query", test: /node_modules\/@tanstack\/(?:react-query|query-core)\//, minShareCount: 2 },
            {
              name: "shell",
              test: (id) =>
                /\/src\/app\/(?:shell|telegram)\//.test(id) && !/\/(?:SellerTabs|SheetRoute)\.tsx$/.test(id),
            },
            {
              name: "ui-core",
              test: (id) =>
                /\/src\/ui\/(?:Button|IconButton|Header|Price|AddToCart|Stepper|ProductImage|Img|Skeleton(?:Block|Row|Text|Tile)?|EmptyState|ErrorState|StickyFooter|Card|StoreHeader|SectionHeader|FloatingActions)\.tsx?$/.test(
                  id,
                ) ||
                /\/src\/shared\/(?:money|flags|http-error|errors)\.ts$/.test(id) ||
                /\/src\/app\/templates\/(?:TemplateSkeleton|TemplatePending|HomeTemplate)\.tsx$/.test(id),
            },
          ],
        },
      },
    },
  },
  optimizeDeps: { include: ["libheif-js/libheif-wasm/libheif.js"] },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
}));
