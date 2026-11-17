import { createMiddleware } from "hono/factory";
import { RequestMetrics } from "../metrics";

export const apiMetrics = createMiddleware(async (c, next) => {
  const metrics = new RequestMetrics();
  await next();
  const encoded = c.res.headers.get("x-korzina-sql");
  const metric = encoded
    ? JSON.parse(encoded)
    : metrics.record(c.req.routePath, undefined, c.res.headers.get("X-Request-Id") ?? "internal", c.res.status, false);
  c.res.headers.delete("x-korzina-sql");
  if (Math.random() < 0.01) console.log(JSON.stringify(metric));
});
