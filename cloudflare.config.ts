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
      PLATFORM: bindings.d1(platformDatabase),
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
      runWorkerFirst: ["/api/*"],
    },
  },
});
