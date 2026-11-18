import type { SqlStatement } from "./create-shop";

export const seedStatements: SqlStatement[] = [
  {
    sql: "INSERT INTO shops (id, slug, name, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
    params: ["korzina-demo-lavka", "lavka", "Демо-магазин", 1794873600000],
  },
  {
    sql: "INSERT INTO shops (id, slug, name, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
    params: ["korzina-demo-test2", "test2", "Второй магазин", 1794873600000],
  },
  {
    sql: "INSERT INTO domains (host, shop_id) VALUES (?, ?) ON CONFLICT(host) DO NOTHING",
    params: ["lavka.demo.korzina.app", "korzina-demo-lavka"],
  },
  {
    sql: "INSERT INTO domains (host, shop_id) VALUES (?, ?) ON CONFLICT(host) DO NOTHING",
    params: ["test2.demo.korzina.app", "korzina-demo-test2"],
  },
];

export const demoSeedShopIds = ["korzina-demo-lavka", "korzina-demo-test2"];

export function requestDemoSeed(shopId: string): SqlStatement {
  return {
    sql: "INSERT INTO demo_seed_queue (shop_id,requested_at) VALUES (?,?) ON CONFLICT(shop_id) DO UPDATE SET requested_at=excluded.requested_at",
    params: [shopId, crypto.randomUUID()],
  };
}
