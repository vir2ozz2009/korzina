import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    maxWorkers: 3,
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
          environment: "node",
          isolate: false,
        },
      },
      {
        test: {
          name: "screens",
          include: ["src/**/*.test.tsx"],
          environment: "happy-dom",
          testTimeout: 1800,
        },
      },
      {
        plugins: [cloudflareTest({ config: true, remoteBindings: false })],
        test: { name: "api", include: ["server/**/*.test.ts"] },
      },
    ],
  },
});
