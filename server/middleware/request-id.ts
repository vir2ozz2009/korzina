import { createMiddleware } from "hono/factory";

export const requestId = createMiddleware(async (c, next) => {
  // The public Worker generates the ID; client-supplied IDs are never trusted.
  c.header("X-Request-Id", crypto.randomUUID());
  c.header("Cache-Control", "no-store");
  await next();
});
