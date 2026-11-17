import assert from "node:assert/strict";

const base = process.argv[2] ?? "https://demo.korzina.app";
const attempts = process.argv.includes("--wait-for-build") ? 18 : 1;

async function smoke() {
  const get = (path: string, headers?: HeadersInit) =>
    fetch(new URL(path, base), {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
  const document = await get("/api/catalog/document?shop=test2");
  assert(document.ok, `document: HTTP ${document.status}`);
  const data = (await document.json()) as {
    catalogVersion: number;
    items: {
      id: string;
      image: { edgeColor?: string; contentBox?: { w: number; h: number } } | null;
      variants: { id: string }[];
    }[];
  };
  assert.equal(data.items.length, 6, "Ждём сид B2: шесть товаров вместо отдельных наборов");
  assert(
    data.items.every((item) => item.image?.edgeColor && item.image.contentBox?.w && item.image.contentBox.h),
    "Ждём метаданные фото B2",
  );
  assert.equal(
    data.items.reduce((count, item) => count + item.variants.length, 0),
    23,
  );
  assert(
    !data.items.some((item) => item.variants.some((variant) => variant.id === "sku-12")),
    "Скрытый SKU не должен попадать в публичный документ",
  );
  assert(!document.headers.has("set-cookie") && !document.headers.has("x-korzina-sql"));
  const etag = document.headers.get("ETag");
  assert(etag);
  const repeat = await get(`/api/catalog/document?shop=test2&version=${data.catalogVersion}`, {
    "If-None-Match": etag,
  });
  assert.equal(repeat.status, 304);
  const ids = data.items.flatMap((p) => p.variants.map((v) => v.id)).slice(0, 49);
  const live = await get(`/api/catalog/live?shop=test2&ids=${ids.join(",")},missing-smoke-sku`);
  assert.equal(live.headers.get("Cache-Control"), "no-store");
  const offers = (await live.json()) as {
    catalogVersion: number;
    items: { id: string; priceMinor: number | null; visible: boolean }[];
  };
  assert.equal(offers.catalogVersion, data.catalogVersion);
  assert.equal(offers.items.length, ids.length + 1);
  assert.deepEqual(offers.items.at(-1), {
    id: "missing-smoke-sku",
    productId: null,
    priceMinor: null,
    oldPriceMinor: null,
    stock: null,
    visible: false,
    available: false,
  });
  const card = await get(`/api/catalog/products/${data.items[0].id}?shop=test2`);
  assert(card.ok, `product: HTTP ${card.status}`);
  assert.equal(card.headers.get("Cache-Control"), "no-store");
  const product = (await card.json()) as { images: { src: string }[]; variants: { priceMinor: number }[] };
  assert(product.variants.length > 0 && product.variants.every((v) => Number.isSafeInteger(v.priceMinor)));
  assert(product.images.length > 0);
  for (const image of product.images) {
    const response = await get(image.src);
    assert(response.ok && /image\//.test(response.headers.get("Content-Type") ?? ""), "Фото должно открываться");
    if (!base.startsWith("http://127.0.0.1") && !base.startsWith("http://localhost"))
      assert.match(response.headers.get("Cache-Control") ?? "", /immutable/);
    await response.body?.cancel();
  }
  const unknown = await get("/api/catalog/products/missing-smoke-product?shop=test2");
  assert.equal(unknown.status, 404);
  await unknown.body?.cancel();
  console.log(
    JSON.stringify({
      event: "catalog_smoke_ok",
      base,
      version: data.catalogVersion,
      products: data.items.length,
      offers: offers.items.length,
      photos: product.images.length,
      etag: 304,
      live: "no-store",
      card: "no-store",
    }),
  );
}

for (let attempt = 1; attempt <= attempts; attempt++) {
  try {
    await smoke();
    break;
  } catch (error) {
    if (attempt === attempts) throw error;
    console.log(`Ожидание каталога после Builds (${attempt}/${attempts})`);
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
}
