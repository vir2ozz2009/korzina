import { ApiError } from "../../src/shared/errors";

export class TelegramRequestError extends ApiError {
  constructor(
    public readonly retryable = false,
    public readonly retryAfterMs = 0,
    public readonly permanent = false,
  ) {
    super("AUTH_UNAVAILABLE", "Telegram временно недоступен");
  }
}

export async function telegramApi(token: string, method: string, body: object): Promise<unknown> {
  const unavailable = () => new TelegramRequestError();
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 401 || response.status === 404) throw new ApiError("AUTH_FAILED", "Токен не подошёл");
    if (!response.ok) {
      const error = await response
        .json<{ ok?: boolean; parameters?: { retry_after?: number } }>()
        .catch(() => undefined);
      const retryable = response.status === 429 || (response.status >= 500 && error?.ok === false);
      const seconds = Number(response.headers.get("Retry-After") ?? error?.parameters?.retry_after ?? 0);
      throw new TelegramRequestError(
        retryable,
        Number.isFinite(seconds) ? Math.max(seconds, 0) * 1000 : 0,
        response.status < 500 && !retryable,
      );
    }
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !("ok" in payload) || payload.ok !== true || !("result" in payload))
      throw unavailable();
    return payload.result;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw unavailable();
  }
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
