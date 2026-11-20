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
      LOCAL_E2E: bindings.text(mode === "e2e" && !isPreview ? "1" : "0"),
      ASSETS: bindings.assets(),
      PLATFORM: bindings.d1(
        !isPreview && mode === "demo"
          ? { id: environmentResources(false).database.id }
          : environmentResources(isPreview).database,
      ),
      MEDIA: bindings.r2({ name: environmentResources(isPreview).media }),
      MEDIA_PUBLIC: bindings.r2({ name: environmentResources(isPreview).publicMedia }),
      IMAGES: bindings.images(),
      MEDIA_PUBLIC_URL: bindings.text(environmentResources(isPreview).publicOrigin),
      MEDIA_SIGNING_KEY: isPreview ? undefined : bindings.secret(),
      PLATFORM_BOT_USERNAME: !isPreview && mode === "demo" ? bindings.text("korzinaapp_demo_bot") : undefined,
      PLATFORM_BOT_TOKEN: !isPreview && mode === "demo" ? bindings.secret() : undefined,
      PLATFORM_BOT_WEBHOOK_SECRET: !isPreview && mode === "demo" ? bindings.secret() : undefined,
    },
    compatibilityDate: "2026-11-16",
    domains: isPreview ? [] : ["demo.korzina.app"],
    observability: {
      enabled: true,
      logs: { enabled: true, headSamplingRate: 1, invocationLogs: false },
      traces: { enabled: true, headSamplingRate: 0.01 },
    },
    assets: {
      notFoundHandling: "single-page-application",
      runWorkerFirst: ["/*", "!/assets/*", "!/brand/*"],
    },
  },
}));
