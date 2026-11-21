export const errorStatus = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  AUTH_UNAVAILABLE: 503,
  AUTH_FAILED: 401,
  FORBIDDEN: 403,
  FEATURE_DISABLED: 403,
  NOT_FOUND: 404,
  SHOP_NOT_FOUND: 404,
  SLUG_RESERVED: 409,
  SLUG_TAKEN: 409,
  SLUG_LOCKED: 409,
  BOT_IN_USE: 409,
  BOT_NOT_STARTED: 409,
  TELEGRAM_UNAVAILABLE: 503,
  DELIVERY_UNKNOWN: 504,
  TOKEN_INVALID: 400,
  CURRENCY_LOCKED: 409,
  INVALID_TRANSITION: 409,
  STOCK_CHANGED: 409,
  DUPLICATE_VARIANT_NAME: 400,
  NOT_EMPTY: 409,
  PRICE_CHANGED: 409,
  VERSION_CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  STORAGE_LIMIT: 413,
  MEDIA_UNAVAILABLE: 503,
  GEOCODER_UNAVAILABLE: 503,
  OUT_OF_ZONE: 409,
  PICKUP_UNAVAILABLE: 409,
  CANCEL_NOT_ALLOWED: 409,
  SLOT_TAKEN: 409,
  QUOTE_CHANGED: 409,
  PAYMENT_METHOD_UNAVAILABLE: 409,
  MIN_ORDER_SUM: 409,
  SHOP_CLOSED: 409,
  ADDRESS_LIMIT: 409,
  ADDRESS_NOT_FOUND: 404,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof errorStatus;
export type ErrorResponse = { error: { code: ErrorCode; message: string; details?: unknown } };

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function errorBody(error: ApiError): ErrorResponse {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
}
