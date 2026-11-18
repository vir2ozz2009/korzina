import { telegramExchangeInput } from "../../../src/shared/contracts/auth";
import { ApiError } from "../../../src/shared/errors";
import { digest } from "../../auth/tokens";

const lifetime = 5 * 60 * 1000;

export async function startExchange(storage: DurableObjectStorage, owner: string) {
  const bot = storage.sql
    .exec<{ value: string }>("SELECT value FROM settings WHERE key='telegram_bot_username'")
    .toArray()[0]?.value;
  if (!bot || !/^[A-Za-z][A-Za-z0-9_]{4,31}$/u.test(bot))
    throw new ApiError("AUTH_UNAVAILABLE", "Telegram магазина пока не подключён");
  const exchange = `purchase_${crypto.randomUUID().replaceAll("-", "")}`;
  const id = await digest(exchange);
  const expiresAt = Date.now() + lifetime;
  storage.sql.exec("INSERT INTO customer_telegram_exchanges(id,owner,expires_at) VALUES(?,?,?)", id, owner, expiresAt);
  const url = new URL(`https://t.me/${bot}`);
  url.searchParams.set("startapp", exchange);
  return { exchange, url: url.href, expiresAt };
}

export async function verifiedExchange(startParam: string | undefined) {
  const parsed = telegramExchangeInput.safeParse({ exchange: startParam });
  return parsed.success ? digest(parsed.data.exchange) : undefined;
}

export function confirmExchange(storage: DurableObjectStorage, id: string, telegramSubject: string) {
  storage.sql.exec(
    "UPDATE customer_telegram_exchanges SET telegram_subject=? WHERE id=? AND telegram_subject IS NULL AND expires_at>?",
    telegramSubject,
    id,
    Date.now(),
  );
}

export function findExchange(storage: DurableObjectStorage, id: string, owner: string) {
  const [row] = storage.sql
    .exec<{ telegram_subject: string | null }>(
      "SELECT telegram_subject FROM customer_telegram_exchanges WHERE id=? AND owner=? AND expires_at>?",
      id,
      owner,
      Date.now(),
    )
    .toArray();
  if (!row) throw new ApiError("AUTH_FAILED", "Время входа через Telegram истекло");
  return row.telegram_subject;
}
