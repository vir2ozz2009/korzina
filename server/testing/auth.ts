import { exports } from "cloudflare:workers";

export const postAuth = (
  path: string,
  body: unknown = {},
  headers: HeadersInit = {},
  origin = "https://demo.korzina.app",
) =>
  exports.default.fetch(
    new Request(`${origin}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID(), ...headers },
      body: JSON.stringify(body),
    }),
  );
export const getAuth = (path: string, headers: HeadersInit = {}, origin = "https://demo.korzina.app") =>
  exports.default.fetch(new Request(`${origin}${path}`, { headers }));
export const cookieFrom = (response: Response) => response.headers.get("Set-Cookie")?.split(";")[0] ?? "";

export async function signedInitData(botToken: string, fields: Record<string, string> = {}) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: 12345 }),
    ...fields,
  });
  const encoder = new TextEncoder();
  const root = await crypto.subtle.importKey(
    "raw",
    encoder.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const secret = await crypto.subtle.sign("HMAC", root, encoder.encode(botToken));
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const check = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const hash = await crypto.subtle.sign("HMAC", key, encoder.encode(check));
  params.set("hash", Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join(""));
  return params.toString();
}
