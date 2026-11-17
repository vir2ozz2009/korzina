export interface SqlStatement {
  sql: string;
  params: (string | number)[];
}

const reserved = new Set(["demo", "www", "api", "app", "admin", "seller"]);

export async function prepareShop(slug: string, name: string, origin = "https://demo.korzina.app") {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug) || reserved.has(slug)) {
    throw new Error("Slug: 1–63 символа a–z, 0–9 и дефис, без дефиса по краям; системные имена запрещены");
  }
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 120) throw new Error("Название: от 1 до 120 символов");
  const base = new URL(origin);
  if (!["https://demo.korzina.app", "http://localhost:5173"].includes(base.origin))
    throw new Error("Неизвестное окружение");
  const shop = { id: crypto.randomUUID(), slug, name: cleanName, createdAt: Date.now() };
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const expiresAt = shop.createdAt + 7 * 24 * 60 * 60 * 1000;
  const statements: SqlStatement[] = [
    {
      sql: "INSERT INTO shops (id, slug, name, created_at) VALUES (?, ?, ?, ?)",
      params: [shop.id, slug, cleanName, shop.createdAt],
    },
    { sql: "INSERT INTO domains (host, shop_id) VALUES (?, ?)", params: [`${slug}.demo.korzina.app`, shop.id] },
    {
      sql: "INSERT INTO invitations (token_hash, shop_id, expires_at) VALUES (?, ?, ?)",
      params: [tokenHash, shop.id, expiresAt],
    },
  ];
  const storefront = new URL(base.origin);
  storefront.searchParams.set("shop", slug);
  const invitation = new URL("/seller/invite", base.origin);
  invitation.searchParams.set("shop", slug);
  invitation.searchParams.set("token", token);
  return { shop, statements, storefront: storefront.href, invitation: invitation.href, expiresAt };
}
