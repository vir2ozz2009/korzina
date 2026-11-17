import { bindings, defineConfig, exports } from "cf/config";
import * as entrypoint from "./server/index" with { type: "cf-worker" };
import { platformDatabase } from "./server/platform/config.ts";

export default defineConfig({
  accountId: "2dfac424ca4eaffa25ca82089bf82132",
  worker: {
    name: "korzina-demo",
    entrypoint,
    exports: { Shop: exports.durableObject({ storage: "sqlite" }) },
    env: {
      ASSETS: bindings.assets(),
      PLATFORM: bindings.d1(platformDatabase),
      MEDIA: bindings.r2({ name: "korzina-demo-media" }),
      MEDIA_PUBLIC: bindings.r2({ name: "korzina-demo-media-public" }),
      IMAGES: bindings.images(),
      MEDIA_PUBLIC_URL: bindings.text("https://media.demo.korzina.app"),
      MEDIA_SIGNING_KEY: bindings.secret(),
      SHOP: bindings.durableObject({ worker: "korzina-demo", exportName: "Shop" }),
    },
    compatibilityDate: "2026-11-16",
    domains: ["demo.korzina.app"],
    observability: {
      enabled: true,
      traces: { enabled: true, headSamplingRate: 0.01 },
    },
    assets: {
      notFoundHandling: "single-page-application",
      runWorkerFirst: ["/*", "!/assets/*", "!/brand/*"],
    },
  },
});
