export const errorStatus = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  AUTH_UNAVAILABLE: 503,
  FORBIDDEN: 403,
  FEATURE_DISABLED: 403,
  NOT_FOUND: 404,
  SHOP_NOT_FOUND: 404,
  STOCK_CHANGED: 409,
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
