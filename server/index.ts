import { Hono } from "hono";

export const app = new Hono()
  .get("/api/health", (c) => c.json({ ok: true }))
  .notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Не найдено" } }, 404));

export type AppType = typeof app;

export default app;
