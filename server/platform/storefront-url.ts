export function storefrontUrl(origin: string, appEnv: string, slug: string) {
  if (appEnv === "production") return `https://${slug}.korzina.app/`;
  const url = new URL("/", origin);
  url.searchParams.set("shop", slug);
  return url.href;
}
