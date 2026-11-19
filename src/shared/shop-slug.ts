const reserved = new Set([
  "www",
  "app",
  "admin",
  "api",
  "demo",
  "lavka",
  "static",
  "cdn",
  "mail",
  "help",
  "support",
  "status",
  "shop",
  "tg",
  "bot",
  "seller",
]);

export function shopSlugError(slug: string): "SLUG_RESERVED" | "VALIDATION" | undefined {
  if (reserved.has(slug) || slug.startsWith("korzina")) return "SLUG_RESERVED";
  if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(slug)) return "VALIDATION";
}
