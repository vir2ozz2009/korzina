import type { ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { ApiError, errorBody, errorStatus } from "../../src/shared/errors";

export const handleError: ErrorHandler = (error, c) => {
  const known =
    error instanceof ApiError
      ? error
      : error instanceof HTTPException && error.status === 400
        ? new ApiError("VALIDATION", "Некорректный запрос")
        : new ApiError("INTERNAL", "Внутренняя ошибка сервера");
  // Never log exception messages, request bodies or headers: they can contain secrets.
  if (known.code === "INTERNAL")
    console.error(
      JSON.stringify({ event: "api_error", requestId: c.res.headers.get("X-Request-Id"), code: known.code }),
    );
  return c.json(errorBody(known), errorStatus[known.code]);
};
export const notFound: NotFoundHandler = (c) => c.json(errorBody(new ApiError("NOT_FOUND", "Не найдено")), 404);
