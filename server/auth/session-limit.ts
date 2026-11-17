import type { Context } from "hono";
import { ApiError } from "../../src/shared/errors";
import { RateLimiter } from "../middleware/rate-limit";

// No raw credential is retained in a bucket. The caller supplies a verified session or account ID.
export function sessionLimiter(limit = 120) {
  const limiter = new RateLimiter(limit);
  return (context: Context, identity: string) => {
    const retry = limiter.consume(identity);
    if (retry) {
      context.header("Retry-After", String(retry));
      throw new ApiError("RATE_LIMITED", "Слишком много запросов. Попробуйте позже");
    }
  };
}
