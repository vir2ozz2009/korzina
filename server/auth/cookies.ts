import { ApiError } from "../../src/shared/errors";

export const sellerCookie = "korzina_seller";
export const customerCookie = (shopId: string) => `korzina_customer_${shopId}`;
export const isLocal = (request: Request) =>
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname);

export function credential(request: Request, cookieName: string): string | undefined {
  const authorization = request.headers.get("Authorization");
  if (authorization) {
    const match = /^Bearer ([a-f0-9]{64})$/.exec(authorization);
    if (!match) throw new ApiError("UNAUTHORIZED", "Сессия недействительна");
    return match[1];
  }
  const cookies =
    request.headers
      .get("Cookie")
      ?.split(";")
      .map((part) => part.trim()) ?? [];
  return cookies.find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
}
export function sessionCookie(request: Request, name: string, token: string, ttlSeconds: number): string {
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttlSeconds}${isLocal(request) ? "" : "; Secure"}`;
}
