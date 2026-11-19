import { Button } from "../../../ui/Button";
import { Chip } from "../../../ui/Chip";
import { ProductTile } from "../../../ui/ProductTile";
import type { useCart } from "../../cart";
import { useCatalog, useOffers } from "../api";
import { storefrontProducts } from "../model";
import { toTiles } from "./toTiles";

const examples = ["Томаты 500 г", "Молоко, хлеб, яйца", "Греческий салат"];

export function SearchStart({
  history,
  clearHistory,
  pick,
  cart,
  choose,
}: {
  history: string[];
  clearHistory: () => void;
  pick: (value: string) => void;
  cart: ReturnType<typeof useCart>;
  choose: (id: string) => void;
}) {
  const catalog = useCatalog();
  const pages = catalog.data?.pages.slice(0, 1) ?? [];
  const offers = useOffers(pages);
  const items = storefrontProducts(pages[0]?.items ?? [], offers.data?.items ?? []);
  const categories = new Set<string>();
  const products = items
    .filter((item) => {
      if (categories.has(item.categoryId) || !item.variants.some((variant) => variant.available)) return false;
      categories.add(item.categoryId);
      return true;
    })
    .slice(0, 4);
  const tiles = offers.data ? toTiles({ products, currency: offers.data.currency, cart, choose }) : [];

  return (
    <div className="space-y-3">
      {history.length > 0 && (
        <section className="space-y-2 rounded-xl bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-title-3">Вы искали</h2>
            <Button variant="ghost" onClick={clearHistory}>
              Очистить
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {history.slice(0, 4).map((value) => (
              <Chip key={value} className="max-w-full truncate bg-secondary" title={value} onClick={() => pick(value)}>
                {value}
              </Chip>
            ))}
          </div>
        </section>
      )}
      <section className="space-y-2">
        <h2 className="text-title-3">Попробуйте поискать</h2>
        <div className="flex flex-wrap gap-2">
          {examples.map((value) => (
            <Chip key={value} onClick={() => pick(value)}>
              {value}
            </Chip>
          ))}
        </div>
      </section>
      {tiles.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-title-3">Товары магазина</h2>
          <div className="grid grid-cols-2 gap-2">
            {tiles.map(({ id, ...tile }) => (
              <ProductTile key={id} {...tile} photoShape="square" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
