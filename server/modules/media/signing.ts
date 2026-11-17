import { ApiError } from "../../../src/shared/errors";

async function signingKey(secret?: string) {
  if (!secret) throw new ApiError("MEDIA_UNAVAILABLE", "Приватные ссылки временно недоступны");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}
const payload = (shop: string, id: string, actor: string, expires: number) =>
  new TextEncoder().encode(JSON.stringify([shop, id, actor, expires]));
export async function signMedia(secret: string | undefined, shop: string, id: string, actor: string, expires: number) {
  const bytes = await crypto.subtle.sign("HMAC", await signingKey(secret), payload(shop, id, actor, expires));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function verifyMedia(
  secret: string | undefined,
  shop: string,
  id: string,
  actor: string,
  expires: number,
  signature: string,
) {
  if (
    !Number.isSafeInteger(expires) ||
    expires <= Date.now() ||
    expires > Date.now() + 300_000 ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    throw new ApiError("FORBIDDEN", "Ссылка на файл истекла");
  const bytes = Uint8Array.from(signature.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
  if (!(await crypto.subtle.verify("HMAC", await signingKey(secret), bytes, payload(shop, id, actor, expires))))
    throw new ApiError("FORBIDDEN", "Нет доступа к файлу");
}
