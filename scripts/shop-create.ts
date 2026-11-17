import { prepareShop } from "../server/platform/create-shop.ts";
import { applyMigrations, query } from "./platform-cli.ts";

const args = process.argv.slice(2);
const local = args.includes("--local");
const values = args.filter((arg) => arg !== "--local");
try {
  if (values.length !== 2) throw new Error("Использование: npm run shop:create -- <slug> <name> [--local]");
  const result = await prepareShop(values[0], values[1], local ? "http://localhost:5173" : undefined);
  applyMigrations(local);
  query(result.statements, local);
  console.log(
    JSON.stringify(
      { shop: result.shop, storefront: result.storefront, invitation: result.invitation, expiresAt: result.expiresAt },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Не удалось создать магазин");
  process.exitCode = 1;
}
