import { appendFileSync } from "node:fs";

const origin = "https://demo.korzina.app";
const broker = "https://korzina-demo-regressions-auth.vir2ozz2009.workers.dev/session";
const { ACTIONS_ID_TOKEN_REQUEST_URL, ACTIONS_ID_TOKEN_REQUEST_TOKEN, GITHUB_ENV, QA1_SELLER_SESSION } = process.env;

if (process.argv.includes("--revoke")) {
  if (QA1_SELLER_SESSION) {
    const response = await fetch(`${origin}/api/platform/auth/logout`, {
      method: "POST",
      body: "{}",
      headers: {
        Cookie: `korzina_seller=${QA1_SELLER_SESSION}`,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Не удалось закрыть учебную сессию: HTTP ${response.status}`);
  }
} else {
  if (!ACTIONS_ID_TOKEN_REQUEST_URL || !ACTIONS_ID_TOKEN_REQUEST_TOKEN || !GITHUB_ENV)
    throw new Error("Нужен контекст GitHub Actions с id-token: write");
  const url = new URL(ACTIONS_ID_TOKEN_REQUEST_URL);
  url.searchParams.set("audience", "korzina-demo-regressions");
  const identity = await fetch(url, {
    headers: { Authorization: `Bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!identity.ok) throw new Error(`GitHub OIDC: HTTP ${identity.status}`);
  const { value } = (await identity.json()) as { value: string };
  const session = await fetch(broker, {
    method: "POST",
    headers: { Authorization: `Bearer ${value}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!session.ok) throw new Error(`Сессия учебного магазина: HTTP ${session.status}`);
  const { token } = (await session.json()) as { token: string };
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Неверный формат учебной сессии");
  console.log(`::add-mask::${token}`);
  appendFileSync(GITHUB_ENV, `QA1_SELLER_SESSION=${token}\n`);
}
