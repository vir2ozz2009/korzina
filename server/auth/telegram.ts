import { z } from "zod";
import { ApiError } from "../../src/shared/errors";

const encoder = new TextEncoder();
const userSchema = z.object({ id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) });
const invalid = () => new ApiError("UNAUTHORIZED", "Данные Telegram недействительны или устарели");
async function hmac(key: Uint8Array<ArrayBuffer>, value: string) {
  const imported = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", imported, encoder.encode(value));
}

export async function verifyInitData(
  initData: string,
  botToken: string,
  now = Date.now(),
): Promise<{ telegramId: string; authDate: number }> {
  if (initData.length > 8192) throw invalid();
  const params = new URLSearchParams(initData);
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length) throw invalid();
  const hash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  if (
    !hash ||
    !/^[a-f0-9]{64}$/.test(hash) ||
    !/^\d+$/.test(params.get("auth_date") ?? "") ||
    !Number.isSafeInteger(authDate) ||
    authDate * 1000 > now + 30_000 ||
    now - authDate * 1000 > 86_400_000
  )
    throw invalid();
  params.delete("hash");
  const check = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = await hmac(encoder.encode("WebAppData"), botToken);
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const signature = Uint8Array.from(hash.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
  if (!(await crypto.subtle.verify("HMAC", key, signature, encoder.encode(check)))) throw invalid();
  try {
    const user = userSchema.parse(JSON.parse(params.get("user") ?? "null"));
    return { telegramId: String(user.id), authDate };
  } catch {
    throw invalid();
  }
}
