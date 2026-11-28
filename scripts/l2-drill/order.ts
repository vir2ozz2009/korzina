import type { Shop } from "../../server/shop/Shop";

export function configureTrainingShop(storage: DurableObjectStorage): void {
  storage.sql.exec("UPDATE catalog_state SET currency='VND' WHERE id=1");
  for (const [key, value] of Object.entries({
    fulfillment: { pickup: { address: "Training", hours: "09:00–20:00" } },
    receiving_schedule: {
      timeZone: "Asia/Ho_Chi_Minh",
      delivery: { mode: "after_order", days: {} },
      pickup: { mode: "after_order", days: {} },
    },
    purchase_payment: { minimumMinor: 0, methods: ["cash", "transfer"], instruction: "Training" },
  }))
    storage.sql.exec("UPDATE settings SET value=? WHERE key=?", JSON.stringify(value), key);
}

export async function createTrainingOrder(shop: DurableObjectStub<Shop>, id: string): Promise<void> {
  const metadata = encodeURIComponent(
    JSON.stringify({ id, slug: "test", name: "Test", status: "active", plan: "base", createdAt: 0 }),
  );
  let cookie = "";
  const post = async (path: string, body: object) => {
    const response = await shop.fetch(
      new Request(`https://internal/api/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
          "x-korzina-shop": metadata,
          Cookie: cookie,
        },
        body: JSON.stringify(body),
      }),
    );
    if (!response.ok) throw new Error(`Training ${path} returned ${response.status}`);
    cookie = response.headers.get("Set-Cookie")?.split(";")[0] ?? cookie;
    return response;
  };
  await post("auth/contact", { phone: "+84912345678", confirmed: true });
  await post("cart", { variantId: "sku-01", quantity: 1, expectedRevision: 0 });
  await post("receiving", { receiving: { mode: "pickup" }, expectedRevision: 1, complete: true });
  const quote = await (await post("quote", {})).json<{ quoteRevision: string }>();
  await post("checkout", { quoteRevision: quote.quoteRevision, payment: "cash" });
}
