import { defineConfig } from "drizzle-kit";
export default defineConfig({ dialect: "sqlite", schema: "./server/shop/schema.ts", out: "./server/shop/migrations" });
