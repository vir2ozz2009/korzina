import type { CatalogListInput, CatalogScope } from "../../../src/shared/contracts/catalog-list";
import { ApiError } from "../../../src/shared/errors";

export function encodeCursor(scope: string, after: string, version: number) {
  const bytes = new TextEncoder().encode(JSON.stringify({ scope, after, version }));
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}
export function listDocumentInput(input: CatalogListInput) {
  let after: string | undefined;
  let version = input.version;
  if (input.cursor) {
    try {
      const cursor = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(input.cursor), (c) => c.charCodeAt(0))));
      if (
        cursor.scope !== input.scope ||
        typeof cursor.after !== "string" ||
        !cursor.after ||
        !Number.isSafeInteger(cursor.version) ||
        cursor.version < 1
      )
        throw new Error("cursor");
      after = cursor.after;
      version = cursor.version;
    } catch {
      throw new ApiError("VALIDATION", "Некорректная страница каталога");
    }
  }
  const scope = input.scope as CatalogScope;
  return {
    limit: 16,
    count: input.count,
    after,
    version,
    ...(scope.startsWith("category:") ? { category: scope.slice(9) } : {}),
    ...(scope.startsWith("brand:") ? { brand: scope.slice(6) } : {}),
  };
}
