import type { CatalogPageInput } from "../../../src/shared/contracts/catalog";
import { type CatalogListInput, usesLiveSelection } from "../../../src/shared/contracts/catalog-list";
import { ApiError } from "../../../src/shared/errors";
import { encodeCursor, listDocumentInput } from "./cursor";
import type { readSelection } from "./selection";
import type { readDocument, readLive } from "./service";

export async function readPage(
  input: CatalogListInput,
  document: (input: CatalogPageInput) => Promise<ReturnType<typeof readDocument>>,
  offers: (ids: string[]) => Promise<ReturnType<typeof readLive>>,
  select: (request: CatalogListInput) => Promise<ReturnType<typeof readSelection>>,
) {
  if (usesLiveSelection(input)) {
    const { ids, count, next, catalogVersion } = await select(input);
    const data = await document({
      limit: 16,
      productIds: [...ids].sort().join(",") || ",",
      version: catalogVersion,
      ...(input.scope.startsWith("category:") ? { category: input.scope.slice(9) } : {}),
      ...(input.scope.startsWith("brand:") ? { brand: input.scope.slice(6) } : {}),
    });
    const byId = new Map(data.items.map((item) => [item.id, item]));
    const items = ids.flatMap((id) => {
      const item = byId.get(id);
      return item ? [item] : [];
    });
    const live = await offers(items.flatMap((p) => p.variants.map((v) => v.id)));
    if (catalogVersion !== live.catalogVersion || catalogVersion !== data.catalogVersion)
      throw new ApiError("VERSION_CONFLICT", "Каталог обновился. Обновите список.");
    return { ...data, items, next, count, offers: live };
  }
  const params = listDocumentInput(input);
  let data = await document(params);
  let live = await offers(data.items.flatMap((p) => p.variants.map((v) => v.id)));
  if (data.catalogVersion !== live.catalogVersion) {
    if (input.cursor) throw new ApiError("VERSION_CONFLICT", "Каталог обновился. Обновите список.");
    data = await document({ ...params, version: live.catalogVersion });
    live = await offers(data.items.flatMap((p) => p.variants.map((v) => v.id)));
  }
  if (data.catalogVersion !== live.catalogVersion || (params.after && params.version !== live.catalogVersion))
    throw new ApiError("VERSION_CONFLICT", "Каталог обновился. Обновите список.");
  return {
    ...data,
    next: data.next ? encodeCursor(input.scope, data.next, live.catalogVersion) : null,
    count: data.count ?? (data.next ? null : data.items.length),
    offers: live,
  };
}
