import { bindings, defineConfig, exports } from "cf/config";
import * as e2eWorker from "./e2e/worker" with { type: "cf-worker" };
import * as entrypoint from "./server/index" with { type: "cf-worker" };
import { environmentResources } from "./server/platform/config.ts";

export default defineConfig(({ mode, isPreview }) => {
  const production = mode === "production" && !isPreview;
  const resources = environmentResources(isPreview, production);
  return {
    accountId: "2dfac424ca4eaffa25ca82089bf82132",
    worker: {
      name: production ? "korzina-prod" : "korzina-demo",
      workersDev: false,
      previewUrls: true,
      entrypoint: mode === "e2e" && !isPreview ? (e2eWorker as typeof entrypoint) : entrypoint,
      exports: {
        Shop: exports.durableObject({ storage: "sqlite" }),
        RestoreShop: exports.durableObject({ storage: "sqlite" }),
      },
      env: {
        APP_ENV: bindings.text(isPreview ? "preview" : mode === "production" ? "production" : "demo"),
        LOCAL_E2E: bindings.text(mode === "e2e" && !isPreview ? "1" : "0"),
        ASSETS: bindings.assets(),
        PLATFORM: bindings.d1({ id: resources.database.id }),
        BACKUPS: bindings.r2({
          name: production ? "korzina-backups" : `korzina-${isPreview ? "preview" : "demo"}-backups`,
        }),
        RESTORE_PLATFORM: bindings.d1(
          production
            ? { id: "d2d162e4-a77d-4ab0-b264-d0d8bb1a7d18" }
            : { name: `korzina-${isPreview ? "preview" : "demo"}-restore-platform` },
        ),
        RESTORE_MEDIA: bindings.r2({
          name: `korzina-${production ? "prod" : isPreview ? "preview" : "demo"}-restore-media`,
        }),
        MEDIA: bindings.r2({ name: resources.media }),
        MEDIA_PUBLIC: bindings.r2({ name: resources.publicMedia }),
        IMAGES: bindings.images(),
        MEDIA_PUBLIC_URL: bindings.text(resources.publicOrigin),
        MEDIA_SIGNING_KEY: isPreview ? undefined : bindings.secret(),
      },
      compatibilityDate: "2026-11-16",
      domains: isPreview ? [] : [production ? "prod.korzina.app" : "demo.korzina.app"],
      triggers: production ? [{ type: "scheduled", schedule: "0 1 * * *" }] : [],
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
  };
});
