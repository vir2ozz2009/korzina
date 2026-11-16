import { defineConfig } from "cf/config";

export default defineConfig({
  accountId: "2dfac424ca4eaffa25ca82089bf82132",
  worker: {
    "name": "korzina-demo",
    "compatibilityDate": "2026-11-16",
    "domains": ["demo.korzina.app"],
    "observability": {
      "enabled": true,
      "traces": { "enabled": true, "headSamplingRate": 0.01 }
    },
    "assets": {
      "notFoundHandling": "single-page-application"
    }
  }
});
