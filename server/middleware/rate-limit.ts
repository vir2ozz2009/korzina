import { createMiddleware } from "hono/factory";
import { ApiError } from "../../src/shared/errors";

export class RateLimiter {
  private readonly buckets = new Map<string, { count: number; until: number }>();
  constructor(
    private readonly limit = 120,
    private readonly windowMs = 60_000,
  ) {}

  consume(key: string, now = Date.now()): number {
    const bucket = this.buckets.get(key);
    if (bucket && bucket.until > now) {
      if (bucket.count >= this.limit) return Math.ceil((bucket.until - now) / 1000);
      bucket.count++;
      return 0;
    }
    if (this.buckets.size >= 10_000) {
      for (const [id, entry] of this.buckets) if (entry.until <= now) this.buckets.delete(id);
      // Saturation must not evict live buckets and let callers bypass the limit.
      if (this.buckets.size >= 10_000) return Math.ceil(this.windowMs / 1000);
    }
    this.buckets.set(key, { count: 1, until: now + this.windowMs });
    return 0;
  }
}

// Best-effort burst protection per isolate; session limits will use verified F4 identities.
export function rateLimit(limiter: RateLimiter, identity: (request: Request) => string) {
  return createMiddleware(async (c, next) => {
    const retry = limiter.consume(identity(c.req.raw));
    if (retry) {
      c.header("Retry-After", String(retry));
      throw new ApiError("RATE_LIMITED", "Слишком много запросов. Попробуйте позже");
    }
    await next();
  });
}
