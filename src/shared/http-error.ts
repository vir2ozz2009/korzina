import { type ErrorCode, errorStatus } from "./errors";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: ErrorCode,
  ) {
    super(message);
  }
}

export async function checkResponse(response: { ok: boolean; status: number; json: () => Promise<unknown> }) {
  if (response.ok) return;
  let message = "Не удалось выполнить запрос";
  let code: ErrorCode | undefined;
  try {
    const body = await response.json();
    if (body && typeof body === "object" && "error" in body && body.error && typeof body.error === "object") {
      if ("message" in body.error && typeof body.error.message === "string") message = body.error.message;
      if ("code" in body.error && typeof body.error.code === "string" && Object.hasOwn(errorStatus, body.error.code))
        code = body.error.code as ErrorCode;
    }
  } catch {
    /* Status still distinguishes an access denial from a failed gateway. */
  }
  throw new HttpError(response.status, message, code);
}

export function errorKind(error: unknown): "access" | "retry" | "message" {
  let status: number | undefined;
  if (error && typeof error === "object") {
    if ("status" in error && typeof error.status === "number") status = error.status;
    else if ("code" in error && typeof error.code === "string" && Object.hasOwn(errorStatus, error.code))
      status = errorStatus[error.code as ErrorCode];
  }
  if (status === 401 || status === 403) return "access";
  return status === undefined || status >= 500 ? "retry" : "message";
}
