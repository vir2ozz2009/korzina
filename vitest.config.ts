import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
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
        plugins: [cloudflareTest({ config: true, remoteBindings: false })],
        test: { name: "api", include: ["server/**/*.test.ts"] },
      },
    ],
  },
});
