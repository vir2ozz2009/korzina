const pending =
  "order_number > COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key='platform_order_watermark'),0)";

export function hasPendingPlatformOrders(storage: DurableObjectStorage) {
  return !!storage.sql
    .exec<{ queued: number }>(`SELECT EXISTS(SELECT 1 FROM order_outbox WHERE ${pending}) AS queued`)
    .one().queued;
}

export async function schedulePlatformOrders(storage: DurableObjectStorage) {
  const due = Date.now() + 1000;
  const existing = await storage.getAlarm();
  if (existing === null || existing > due) await storage.setAlarm(due);
}

export async function publishPlatformOrders(storage: DurableObjectStorage, database?: D1Database) {
  if (!database) return false;
  const orders = storage.sql
    .exec<{ order_number: number; created_at: number; shop_id: string | null }>(`
    SELECT order_number,created_at,(SELECT value FROM settings WHERE key='shop_id') AS shop_id
    FROM order_outbox WHERE ${pending} ORDER BY order_number LIMIT 25`)
    .toArray();
  const id = orders[0]?.shop_id;
  if (!id) return false;
  await database.batch(
    orders.map((order) =>
      database
        .prepare(`INSERT INTO platform_order_events(shop_id,order_number,created_at) VALUES(?,?,?)
      ON CONFLICT(shop_id,order_number) DO NOTHING`)
        .bind(id, order.order_number, order.created_at),
    ),
  );
  storage.sql.exec(
    `INSERT INTO settings(key,value) VALUES('platform_order_watermark',?)
    ON CONFLICT(key) DO UPDATE SET value=MAX(CAST(value AS INTEGER),CAST(excluded.value AS INTEGER))`,
    orders[orders.length - 1].order_number,
  );
  return orders.length === 25;
}
