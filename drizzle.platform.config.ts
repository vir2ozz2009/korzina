import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "sqlite",
  schema: "./server/platform/schema.ts",
  out: "./server/platform/migrations",
});
