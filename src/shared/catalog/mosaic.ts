import type { CatalogCategorySize } from "../contracts/catalog";

export function categoryMosaic<T extends { tileSize?: CatalogCategorySize | null }>(categories: T[]) {
  const occupied = new Set<string>();
  return categories.map((category, index) => {
    const slot = index % 4;
    const size = category.tileSize ?? (slot === 0 || slot === 3 ? "2x1" : "1x1");
    const width = size.startsWith("2") ? 2 : 1;
    const height = size.endsWith("2") ? 2 : 1;
    for (let left = 1; ; left += 3) {
      for (let row = 1; row <= 3 - height; row++) {
        for (let column = left; column < left + 3; column++) {
          const cells = Array.from(
            { length: width * height },
            (_, cell) => `${column + (cell % width)}:${row + Math.floor(cell / width)}`,
          );
          if (cells.some((cell) => occupied.has(cell))) continue;
          for (const cell of cells) occupied.add(cell);
          return { category, column, row, size };
        }
      }
    }
  });
}
