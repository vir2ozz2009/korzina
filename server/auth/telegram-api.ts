import { ApiError } from "../../src/shared/errors";

type TelegramFailure =
  | { kind: "http" | "invalid_response"; httpStatus: number }
  | { kind: "timeout" | "network"; httpStatus?: number };

export class TelegramApiError extends ApiError {
  constructor(
    public readonly failure: TelegramFailure,
    code: "AUTH_FAILED" | "AUTH_UNAVAILABLE" | "TOKEN_INVALID" = "AUTH_UNAVAILABLE",
  ) {
    super(code, code === "AUTH_UNAVAILABLE" ? "Telegram временно недоступен" : "Токен не подошёл");
  }
}

export class TelegramRequestError extends TelegramApiError {
  constructor(
    failure: TelegramFailure,
    public readonly retryable = false,
    public readonly retryAfterMs = 0,
    public readonly permanent = false,
  ) {
    super(failure);
  }
}

export async function telegramApi(token: string, method: string, body: object): Promise<unknown> {
  return (await telegramRequest(token, method, body)).result;
}

export async function telegramRequest(token: string, method: string, body: object, timeoutMs = 5000) {
  const signal = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    throw new TelegramRequestError({ kind: signal.aborted ? "timeout" : "network" });
  }
  const httpStatus = response.status;
  if (httpStatus === 401 || httpStatus === 404) throw new TelegramApiError({ kind: "http", httpStatus }, "AUTH_FAILED");
  if (!response.ok) {
    const error = await response.json<{ ok?: boolean; parameters?: { retry_after?: number } }>().catch(() => undefined);
    const retryable = httpStatus === 429 || (httpStatus >= 500 && error?.ok === false);
    const seconds = Number(response.headers.get("Retry-After") ?? error?.parameters?.retry_after ?? 0);
    throw new TelegramRequestError(
      { kind: "http", httpStatus },
      retryable,
      Number.isFinite(seconds) ? Math.max(seconds, 0) * 1000 : 0,
      httpStatus < 500 && !retryable,
    );
  }
  const payload: unknown = await response.json().catch((error: unknown) => {
    const kind = signal.aborted ? "timeout" : error instanceof SyntaxError ? "invalid_response" : "network";
    throw new TelegramRequestError({ kind, httpStatus });
  });
  if (!payload || typeof payload !== "object" || !("ok" in payload) || payload.ok !== true || !("result" in payload))
    throw new TelegramRequestError({ kind: "invalid_response", httpStatus });
  return { result: payload.result, httpStatus };
}

export async function matchesTelegramSecret(actual: string | undefined, expected: string | undefined) {
  if (!actual || !expected || actual.length > 256) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual(left: ArrayBuffer, right: ArrayBuffer): boolean };
  return subtle.timingSafeEqual(left, right);
}
