import { encryptBotToken } from "../auth/bot-token";

export const botFixtureKey = "ab".repeat(32);

export async function setShopBot(database: D1Database, shop: string, id: string, username = `KorzinaFixture${id}Bot`) {
  const token = `${id}:synthetic-shop-bot-fixture`;
  await database.batch([
    database
      .prepare(`INSERT INTO shop_bots(shop_id,telegram_id,username,token) VALUES(?,?,?,?)
      ON CONFLICT(shop_id) DO UPDATE SET telegram_id=excluded.telegram_id,username=excluded.username,token=excluded.token`)
      .bind(shop, id, username, await encryptBotToken(token, shop, botFixtureKey)),
    database.prepare("UPDATE shops SET bot_username=? WHERE id=?").bind(username, shop),
  ]);
  return { id, shop, username, token };
}
