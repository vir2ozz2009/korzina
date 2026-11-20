import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    maxWorkers: 5,
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
        test: {
          name: "api",
          include: ["server/**/*.test.ts"],
          // Bundle the dependencies used by each isolated Workers test file.
          deps: {
            optimizer: {
              ssr: {
                enabled: true,
                include: [
                  "@hono/zod-validator",
                  "drizzle-orm",
                  "drizzle-orm/durable-sqlite",
                  "drizzle-orm/durable-sqlite/migrator",
                  "drizzle-orm/sqlite-core",
                  "hono",
                  "hono/body-limit",
                  "hono/client",
                  "hono/factory",
                  "hono/http-exception",
                  "hono/route",
                  "zod",
                  "zod/mini",
                ],
              },
            },
          },
        },
      },
    ],
  },
});
