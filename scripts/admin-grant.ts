import { applyMigrations, query } from "./platform-cli.ts";

const args = process.argv.slice(2);
const local = args.includes("--local");
const ids = args.filter((arg) => arg !== "--local");
const id = ids[0];
if (ids.length !== 1 || !/^[1-9][0-9]{0,15}$/.test(id ?? "")) {
  console.error("Использование: npm run admin:grant -- <telegram_id> [--local]");
  process.exitCode = 1;
} else {
  applyMigrations(local);
  query(
    [
      {
        sql: "INSERT INTO accounts(id,telegram_id) VALUES(?,?) ON CONFLICT(telegram_id) DO NOTHING",
        params: [crypto.randomUUID(), id],
      },
      {
        sql: "INSERT INTO platform_admins(account_id) SELECT id FROM accounts WHERE telegram_id=? ON CONFLICT(account_id) DO NOTHING",
        params: [id],
      },
    ],
    local,
  );
  console.log("Роль выдана. Доступ также требует Telegram-ID в PLATFORM_ADMIN_TELEGRAM_IDS.");
}
