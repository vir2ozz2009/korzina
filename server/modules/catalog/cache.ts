import type { CatalogPageInput } from "../../../src/shared/contracts/catalog";

const documentFormat = "R1-media-v2";

function matches(request: Request, etag: string) {
  return request.headers
    .get("If-None-Match")
    ?.split(",")
    .some((tag) => {
      const value = tag.trim().replace(/^W\//, "");
      return value === "*" || value === etag;
    });
}

// Callers requesting a known version bypass Shop entirely on a cache hit.
// The unversioned discovery alias lasts 30 s; live data always supplies the authoritative version.
export async function cachedDocument(
  request: Request,
  input: CatalogPageInput,
  namespace: string,
  shopId: string,
  load: () => Promise<Response>,
) {
  const cache = await caches.open("catalog-documents");
  const page = new URLSearchParams({ limit: String(input.limit) });
  if (input.after) page.set("after", input.after);
  if (input.category) page.set("category", input.category);
  if (input.brand) page.set("brand", input.brand);
  const key = (version: string) =>
    `https://catalog.invalid/${documentFormat}/${encodeURIComponent(namespace)}/${encodeURIComponent(shopId)}/${version}?${page}`;
  const hit = await cache.match(key(String(input.version ?? "current")));
  if (hit) {
    const headers = new Headers(hit.headers);
    headers.set("Cache-Control", "public, no-cache");
    return new Response(matches(request, headers.get("ETag") ?? "") ? null : hit.body, {
      status: matches(request, headers.get("ETag") ?? "") ? 304 : 200,
      headers,
    });
  }
  const upstream = await load();
  const response = new Response(upstream.body, upstream);
  if (!response.ok) return response;
  const version = response.headers.get("X-Catalog-Version");
  if (!version) return response;
  const etag = `"catalog-${documentFormat}-${version}-${encodeURIComponent(page.toString())}"`;
  const headers = new Headers({
    "Content-Type": "application/json; charset=UTF-8",
    ETag: etag,
    "X-Catalog-Version": version,
    "Cache-Control": "public, max-age=31536000",
  });
  const cached = new Response(response.clone().body, { headers });
  await cache.put(key(version), cached.clone());
  if (!input.version) {
    cached.headers.set("Cache-Control", "public, max-age=30");
    await cache.put(key("current"), cached);
  }
  response.headers.set("ETag", etag);
  response.headers.set("Cache-Control", "public, no-cache");
  return matches(request, etag) ? new Response(null, { status: 304, headers: response.headers }) : response;
}
