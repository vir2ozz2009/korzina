import type { CatalogPageInput } from "../../../src/shared/contracts/catalog";
import type { CatalogListInput } from "../../../src/shared/contracts/catalog-list";
import { ApiError } from "../../../src/shared/errors";
import { encodeCursor, listDocumentInput } from "./cursor";
import type { readDocument, readLive } from "./service";

export async function readPage(
  input: CatalogListInput,
  document: (input: CatalogPageInput) => Promise<ReturnType<typeof readDocument>>,
  offers: (ids: string[]) => Promise<ReturnType<typeof readLive>>,
) {
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
    offers: live,
  };
}
