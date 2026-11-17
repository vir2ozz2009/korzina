import { createMiddleware } from "hono/factory";
import { ApiError } from "../../src/shared/errors";

export type CommandIdentity = { key: string; fingerprint: string };
export type CommandVariables = { command: CommandIdentity };
export async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const idempotency = createMiddleware<{ Variables: CommandVariables }>(async (c, next) => {
  const key = c.req.header("Idempotency-Key");
  if (!key || !/^[\x21-\x7e]{1,128}$/.test(key))
    throw new ApiError("VALIDATION", "Нужен Idempotency-Key (1–128 символов)");
  const origin = c.req.header("Origin");
  if ((origin && origin !== new URL(c.req.url).origin) || c.req.header("Sec-Fetch-Site") === "cross-site") {
    throw new ApiError("FORBIDDEN", "Запрос с другого сайта запрещён");
  }
  if (!c.req.header("Content-Type")?.toLowerCase().startsWith("application/json")) {
    throw new ApiError("VALIDATION", "Нужен JSON");
  }
  const body = await c.req.text();
  const url = new URL(c.req.url);
  url.searchParams.delete("shop");
  url.searchParams.sort();
  c.set("command", {
    key: await digest(key),
    fingerprint: await digest(`${c.req.method}\n${url.pathname}${url.search}\n${body}`),
  });
  await next();
});
