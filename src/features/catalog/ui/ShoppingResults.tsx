import { EmptyState } from "../../../ui/EmptyState";
import { ProductTile } from "../../../ui/ProductTile";
import { StorefrontState } from "../../../ui/StorefrontState";
import type { useCart } from "../../cart";
import { storefrontProducts } from "../model";
import { useShoppingMatches } from "../search-api";
import { toTiles } from "./toTiles";

export function ShoppingResults({
  query,
  dish,
  cart,
  offline,
  choose,
  remember,
}: {
  query: string;
  dish?: string;
  offline: boolean;
  cart: ReturnType<typeof useCart>;
  choose: (id: string) => void;
  remember: () => void;
}) {
  const result = useShoppingMatches(query, true);
  if (result.isPending) return offline ? null : <StorefrontState state="loading" />;
  if (!result.data)
    return (
      <EmptyState
        title="Не удалось выполнить поиск"
        description="Попробуйте ещё раз. Ваш запрос сохранён"
        action="Повторить"
        onAction={() => void result.refetch()}
      />
    );

  const { items, offers, groups } = result.data;
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const missing = groups.filter((group) => !group.ids.length);
  const renderTiles = (ids: string[], preferred?: Record<string, string>, columns = 2) => {
    const ordered = ids.flatMap((id) => {
      const item = itemsById.get(id);
      return item ? [item] : [];
    });
    const tiles = toTiles({
      products: storefrontProducts(ordered, offers.items),
      currency: offers.currency,
      cart,
      choose,
      preferred,
    });
    return (
      <div className={columns === 2 ? "grid grid-cols-2 gap-2" : "grid"}>
        {tiles.map(({ id, ...tile }) => (
          <ProductTile key={id} {...tile} onOpen={remember} />
        ))}
      </div>
    );
  };

  if (dish)
    return (
      <div className="space-y-3">
        <section className="space-y-1 rounded-xl bg-card p-4">
          <h2 className="text-title-3">Для греческого салата</h2>
          <p className="text-muted-foreground">Подходящие продукты из ассортимента магазина</p>
        </section>
        {items.length ? (
          renderTiles([...new Set(groups.flatMap((group) => group.ids))])
        ) : (
          <EmptyState title="Подходящие товары не найдены" description="Попробуйте поискать отдельные ингредиенты" />
        )}
      </div>
    );

  return (
    <div className="grid grid-cols-2 items-start gap-x-2 gap-y-4">
      {groups.map(
        (group) =>
          group.ids.length > 0 && (
            <section key={group.term} className={group.ids.length === 1 ? "min-w-0 space-y-2" : "col-span-2 space-y-2"}>
              <h2 className="min-h-7 break-words text-title-3 first-letter:uppercase">{group.term}</h2>
              {renderTiles(group.ids, group.preferred, group.ids.length === 1 ? 1 : 2)}
            </section>
          ),
      )}
      {missing.length > 0 && (
        <section className="col-span-2 space-y-2 rounded-xl bg-card p-4">
          <h2 className="text-title-3">Не удалось найти</h2>
          <ul className="space-y-1">
            {missing.map(({ term }) => (
              <li key={term}>{term}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
