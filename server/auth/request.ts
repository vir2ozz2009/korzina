import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import { ApiError } from "../../src/shared/errors";
import { type CommandVariables, idempotency } from "../middleware/idempotency";

export const authBodyLimit = bodyLimit({
  maxSize: 16_384,
  onError: () => {
    throw new ApiError("PAYLOAD_TOO_LARGE", "Слишком большой запрос");
  },
});
export const authCommand = createMiddleware<{ Variables: CommandVariables }>(async (c, next) => {
  if (c.req.method !== "POST") return next();
  return idempotency(c, next);
});
export function validationFailure(result: { success: boolean }) {
  if (!result.success) throw new ApiError("VALIDATION", "Некорректные данные");
}
