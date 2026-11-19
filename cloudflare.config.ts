import { bindings, defineConfig, exports } from "cf/config";
import * as e2eWorker from "./e2e/worker" with { type: "cf-worker" };
import * as entrypoint from "./server/index" with { type: "cf-worker" };
import { environmentResources } from "./server/platform/config.ts";

export default defineConfig(({ mode, isPreview }) => ({
  accountId: "2dfac424ca4eaffa25ca82089bf82132",
  worker: {
    name: "korzina-demo",
    workersDev: false,
    previewUrls: true,
    entrypoint: mode === "e2e" && !isPreview ? (e2eWorker as typeof entrypoint) : entrypoint,
    exports: { Shop: exports.durableObject({ storage: "sqlite" }) },
    env: {
      APP_ENV: bindings.text(isPreview ? "preview" : mode === "production" ? "production" : "demo"),
      ASSETS: bindings.assets(),
      PLATFORM: bindings.d1(environmentResources(isPreview).database),
      MEDIA: bindings.r2({ name: environmentResources(isPreview).media }),
      MEDIA_PUBLIC: bindings.r2({ name: environmentResources(isPreview).publicMedia }),
      IMAGES: bindings.images(),
      MEDIA_PUBLIC_URL: bindings.text(environmentResources(isPreview).publicOrigin),
      MEDIA_SIGNING_KEY: isPreview ? undefined : bindings.secret(),
    },
    compatibilityDate: "2026-11-16",
    domains: isPreview ? [] : ["demo.korzina.app"],
    observability: {
      enabled: true,
      traces: { enabled: true, headSamplingRate: 0.01 },
    },
    assets: {
      notFoundHandling: "single-page-application",
      runWorkerFirst: ["/*", "!/assets/*", "!/brand/*"],
    },
  },
}));
