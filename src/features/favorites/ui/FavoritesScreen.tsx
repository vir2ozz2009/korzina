import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { useState } from "react";
import { QueryBoundary } from "../../../app/shell/QueryBoundary";
import { CatalogTemplate } from "../../../app/templates/CatalogTemplate";
import { storefrontProducts } from "../../../shared/catalog/model";
import { checkResponse } from "../../../shared/http-error";
import { shopApi, shopKey } from "../../../shared/shop-api";
import { Button } from "../../../ui/Button";
import { EmptyState } from "../../../ui/EmptyState";
import { ListItem } from "../../../ui/ListItem";
import { ProductTile } from "../../../ui/ProductTile";
import { useCart } from "../../cart";
import { toTiles, VariantsSheet } from "../../catalog";
import { ContactSheet } from "../../contact";
import { useFavorites } from "../FavoritesProvider";

export function FavoritesScreen() {
  const favorites = useFavorites();
  const ids = favorites?.ids ?? [];
  const [login, setLogin] = useState(false);
  const [variant, setVariant] = useState<string>();
  const navigate = useNavigate();
  const cart = useCart();
  const query = useQuery({
    queryKey: ["shop", shopKey, "favorites", "tiles", ids],
    enabled: ids.length > 0,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const pages = [];
      for (let start = 0; start < ids.length; start += 120) {
        const response = await shopApi.api.favorites.tiles.$post(
          { json: { ids: ids.slice(start, start + 120) } },
          { init: { signal } },
        );
        await checkResponse(response);
        pages.push(await response.json());
      }
      return {
        currency: pages[0]?.currency ?? "",
        products: storefrontProducts(
          pages.flatMap((page) => page.items),
          pages.flatMap((page) => page.offers),
        ),
      };
    },
  });
  const tiles = query.data
    ? toTiles({ products: query.data.products, currency: query.data.currency, cart, choose: setVariant })
    : [];
  const byId = new Map(tiles.map((tile) => [tile.id, tile]));
  // The saved order breaks ties within the two availability groups.
  const sorted = ids
    .map((id) => byId.get(id))
    .filter((tile) => tile !== undefined)
    .sort((a, b) => Number(b.cart.max > 0) - Number(a.cart.max > 0));
  const missing = ids.filter((id) => !byId.has(id));
  return (
    <CatalogTemplate title="Избранное" layout="list">
      {!favorites?.signedIn && (
        <Button full variant="secondary" onClick={() => setLogin(true)}>
          Войти
        </Button>
      )}
      {favorites?.loading && <p role="status">Загружаем избранное…</p>}
      {(favorites?.failed || favorites?.mergeFailed) && (
        <div role="alert" className="space-y-2">
          <p>{favorites.mergeFailed ? "Не удалось синхронизировать избранное" : "Не удалось загрузить избранное"}</p>
          {!!ids.length && <p>Сохранено на устройстве</p>}
          <Button variant="ghost" onClick={favorites.retry}>
            Повторить
          </Button>
        </div>
      )}
      {!ids.length && !favorites?.loading && !favorites?.failed && (
        <EmptyState
          title="Здесь будут товары, которые вам понравились"
          icon={<Heart />}
          action="На главную"
          onAction={() => void navigate({ to: "/" })}
        />
      )}
      {!!ids.length && (
        <QueryBoundary query={query} template="catalog">
          {() => (
            <>
              <div className="grid grid-cols-2 gap-2">
                {sorted.map(({ id, ...tile }) => (
                  <ProductTile key={id} {...tile} />
                ))}
              </div>
              {missing.map((id) => (
                <ListItem
                  key={id}
                  title="Товар больше недоступен"
                  value="Убрать"
                  onClick={() => favorites?.select(id, false)}
                />
              ))}
            </>
          )}
        </QueryBoundary>
      )}
      {variant && <VariantsSheet id={variant} onClose={() => setVariant(undefined)} />}
      <ContactSheet mode={login ? "telegram" : undefined} close={() => setLogin(false)} />
    </CatalogTemplate>
  );
}
