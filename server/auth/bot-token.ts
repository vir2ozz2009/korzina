import { ApiError } from "../../src/shared/errors";

const encoder = new TextEncoder();
const unavailable = () => new ApiError("AUTH_UNAVAILABLE", "Вход через Telegram пока не настроен");
async function encryptionKey(secret: string | undefined) {
  if (!secret || !/^[a-f0-9]{64}$/.test(secret)) throw unavailable();
  const raw = Uint8Array.from(secret.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function encryptBotToken(token: string, shopId: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(shopId) },
    await encryptionKey(secret),
    encoder.encode(token),
  );
  const hexIv = Array.from(iv, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `v1.${hexIv}.${btoa(String.fromCharCode(...new Uint8Array(cipher)))}`;
}
export async function decryptBotToken(
  cipher: string | undefined,
  shopId: string,
  secret: string | undefined,
): Promise<string> {
  if (!cipher) throw unavailable();
  const [version, encodedIv, encodedCipher] = cipher.split(".");
  if (version !== "v1" || !/^[a-f0-9]{24}$/.test(encodedIv ?? "") || !encodedCipher) throw unavailable();
  try {
    const iv = Uint8Array.from(encodedIv.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
    const data = Uint8Array.from(atob(encodedCipher), (char) => char.charCodeAt(0));
    const raw = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: encoder.encode(shopId) },
      await encryptionKey(secret),
      data,
    );
    const token = new TextDecoder().decode(raw);
    if (!token) throw unavailable();
    return token;
  } catch {
    throw unavailable();
  }
}
