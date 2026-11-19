import { telegramExchangeInput } from "../../../src/shared/contracts/auth";
import { ApiError } from "../../../src/shared/errors";
import { digest } from "../../auth/tokens";
import { hasTelegramProfile, initTelegramProfile } from "../profile/service";

const lifetime = 5 * 60 * 1000;

export const demoBuyerExchange = /^purchase_demo_[a-f0-9]{32}$/u;
export const shopBuyerExchange = /^purchase_[a-f0-9]{32}$/u;

export async function startExchange(
  storage: DurableObjectStorage,
  owner: string,
  botOverride?: string | null,
  demoBot?: () => Promise<string>,
  returnUrl?: string,
) {
  const bot =
    botOverride === undefined
      ? storage.sql.exec<{ value: string }>("SELECT value FROM settings WHERE key='telegram_bot_username'").toArray()[0]
          ?.value
      : botOverride;
  const fallback = !bot && botOverride === undefined && demoBot ? await demoBot() : undefined;
  const username = bot || fallback;
  if (!username || !/^[A-Za-z][A-Za-z0-9_]{4,31}$/u.test(username))
    throw new ApiError("AUTH_UNAVAILABLE", "Telegram магазина пока не подключён");
  const exchange = `purchase_${fallback ? "demo_" : ""}${crypto.randomUUID().replaceAll("-", "")}`;
  const id = await digest(exchange);
  const expiresAt = Date.now() + lifetime;
  storage.sql.exec(
    "INSERT INTO customer_telegram_exchanges(id,owner,expires_at,return_url) VALUES(?,?,?,?)",
    id,
    owner,
    expiresAt,
    returnUrl ?? null,
  );
  const url = new URL(`https://t.me/${username}`);
  url.searchParams.set(fallback || botOverride ? "start" : "startapp", exchange);
  return { exchange, url: url.href, expiresAt };
}

export async function verifiedExchange(startParam: string | undefined) {
  const parsed = telegramExchangeInput.safeParse({ exchange: startParam });
  return parsed.success ? digest(parsed.data.exchange) : undefined;
}

export function confirmExchange(
  storage: DurableObjectStorage,
  id: string,
  telegramSubject: string,
  requiresMerge = false,
) {
  return (
    storage.sql.exec(
      "UPDATE customer_telegram_exchanges SET telegram_subject=?,requires_merge=? WHERE id=? AND telegram_subject IS NULL AND expires_at>?",
      telegramSubject,
      Number(requiresMerge),
      id,
      Date.now(),
    ).rowsWritten === 1
  );
}

export async function confirmBrowserBuyer(
  storage: DurableObjectStorage,
  exchange: string,
  telegramId: string,
  name: string,
) {
  const id = await digest(exchange);
  const subject = `telegram:${telegramId}`;
  return storage.transactionSync(() => {
    if (confirmExchange(storage, id, subject, hasTelegramProfile(storage, subject)))
      initTelegramProfile(storage, subject, name);
    return storage.sql
      .exec<{ return_url: string | null }>(
        "SELECT return_url FROM customer_telegram_exchanges WHERE id=? AND telegram_subject=? AND expires_at>?",
        id,
        subject,
        Date.now(),
      )
      .toArray()[0];
  });
}

export function findExchange(storage: DurableObjectStorage, id: string, owner: string) {
  const [row] = storage.sql
    .exec<{ telegram_subject: string | null; requires_merge: number }>(
      `SELECT telegram_subject,requires_merge FROM customer_telegram_exchanges
      WHERE id=? AND owner=? AND expires_at>? AND completed_at IS NULL`,
      id,
      owner,
      Date.now(),
    )
    .toArray();
  if (!row) throw new ApiError("AUTH_FAILED", "Время входа через Telegram истекло");
  return row.telegram_subject
    ? { subject: row.telegram_subject, requiresMerge: Boolean(row.requires_merge) }
    : undefined;
}
