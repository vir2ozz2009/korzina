import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CatalogTemplate } from "../../../app/templates/CatalogTemplate";
import { storefrontProducts } from "../../../shared/catalog/model";
import type { CatalogFilters as Filters } from "../../../shared/contracts/catalog-list";
import { readShoppingSearch } from "../../../shared/shopping-search";
import { Button } from "../../../ui/Button";
import { EmptyState } from "../../../ui/EmptyState";
import { ProductTile } from "../../../ui/ProductTile";
import { StorefrontState } from "../../../ui/StorefrontState";
import { useCart } from "../../cart";
import { readFilterParams } from "../filter-params";
import { useProductList } from "../list-api";
import { useCatalogSearch } from "../search-api";
import { useSearchHistory } from "../search-history";
import { CatalogFilters } from "./CatalogFilters";
import { SearchInput } from "./SearchInput";
import { SearchStart } from "./SearchStart";
import { ShoppingResults } from "./ShoppingResults";
import { asksForPackSize } from "./search-pack-size";
import { toTiles } from "./toTiles";
import { VariantsSheet } from "./VariantsSheet";

export function SearchScreen() {
  const params = useSearch({ from: "/search" });
  const navigate = useNavigate({ from: "/search" });
  const [draft, setDraft] = useState<Filters>();
  const [query, setQuery] = useState(params.q ?? "");
  const field = useRef<HTMLTextAreaElement>(null);
  const { history, remember, clear: clearHistory } = useSearchHistory(params.shop ?? window.location.hostname);
  const filters = readFilterParams(params);
  const q = (params.q ?? "").trim();
  const draftQuery = readShoppingSearch(query);
  const parsed = readShoppingSearch(q);
  const single = parsed.kind === "single" && parsed.q.length <= 180 ? parsed.q : "";
  const groupSearch = q.length >= 2 && !single && parsed.kind !== "error";
  const queryActive = q.length >= 2;
  const result = useCatalogSearch(single, filters);
  const preview = useCatalogSearch(
    single,
    draft,
    !!draft && (draft.min === undefined || draft.max === undefined || draft.min <= draft.max),
  );
  const supported = /[\p{L}\p{N}]/u.test(query);
  const waiting = supported && query.trim() !== q;
  const data = waiting ? undefined : result.data;
  const popular = useProductList("all", undefined, !!data && !data.count && !Object.values(filters).some(Boolean));
  const [offline, setOffline] = useState(!navigator.onLine);
  const cart = useCart();
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (draftQuery.kind === "error" || query.trim() === q) return;
    const timer = setTimeout(
      () =>
        void navigate({
          replace: true,
          resetScroll: false,
          search: (previous) => ({ ...previous, q: query.trim() || undefined, variants: undefined }),
        }),
      250,
    );
    return () => clearTimeout(timer);
  }, [draftQuery.kind, navigate, q, query]);
  const apply = (value: Filters) =>
    void navigate({
      search: (previous) => ({
        ...previous,
        sort: undefined,
        min: undefined,
        max: undefined,
        cat: undefined,
        brands: undefined,
        inStock: undefined,
        ...value,
      }),
      resetScroll: false,
    });
  const pick = (value: string) => {
    setQuery(value);
    remember(value);
    field.current?.blur();
  };
  const choose = (id: string) => {
    remember(query);
    void navigate({ search: (previous) => ({ ...previous, variants: id }), resetScroll: false });
  };
  const source = data?.items.length ? data : popular.data?.pages[0];
  const tiles = source
    ? toTiles({
        products: storefrontProducts(source.items, source.offers.items),
        currency: source.offers.currency,
        cart,
        choose,
        preferred: data?.preferred,
      })
    : [];
  const hasFilters = Object.values(filters).some(Boolean);
  const clearQuery = () => {
    setQuery("");
    field.current?.blur();
    void navigate({ replace: true, search: (previous) => ({ shop: previous.shop }), resetScroll: false });
  };
  return (
    <>
      <CatalogTemplate title="Нейропоиск" layout="list">
        <SearchInput
          field={field}
          query={query}
          invalid={draftQuery.kind === "error"}
          onChange={setQuery}
          onClear={clearQuery}
          onSubmit={() => {
            if (draftQuery.kind !== "error") remember(query);
            field.current?.blur();
          }}
        />
        {draftQuery.kind === "error" ? (
          <section role="alert" className="space-y-1 rounded-xl bg-card p-4">
            <h2 className="text-title-3">{draftQuery.title}</h2>
            <p className="text-muted-foreground">{draftQuery.message}</p>
          </section>
        ) : waiting && query.trim().length >= 2 ? (
          !offline && query.trim().length >= 2 && <StorefrontState state="loading" />
        ) : !queryActive || query.trim().length < 2 ? (
          query.trim() ? (
            <p className="text-muted-foreground">Введите ещё один символ</p>
          ) : (
            <SearchStart history={history} clearHistory={clearHistory} pick={pick} cart={cart} choose={choose} />
          )
        ) : !supported ? (
          <EmptyState title="Введите название товара" description="Поиск понимает названия, бренды и категории" />
        ) : groupSearch ? (
          <>
            {offline && <p className="rounded-xl bg-card p-3">Цена и наличие уточнятся при добавлении</p>}
            <ShoppingResults
              query={q}
              dish={parsed.kind === "dish" ? parsed.name : undefined}
              offline={offline}
              cart={cart}
              choose={choose}
              remember={() => remember(query)}
            />
          </>
        ) : (
          <>
            {offline && data && <p className="rounded-xl bg-card p-3">Цена и наличие уточнятся при добавлении</p>}
            {result.isPending && !offline && <StorefrontState state="loading" />}
            {(result.isError || offline) && !waiting && !data && (
              <EmptyState
                title={offline ? "Нет соединения" : "Не удалось выполнить поиск"}
                description={offline ? undefined : "Попробуйте ещё раз. Ваш запрос сохранён"}
                action="Повторить"
                onAction={() => void result.refetch()}
              />
            )}
            {data && (
              <>
                {data.suggestion && (
                  <div className="rounded-xl bg-card p-3">
                    Возможно, вы имели в виду{" "}
                    <Button variant="ghost" className="text-primary-text" onClick={() => pick(data.suggestion ?? "")}>
                      {data.suggestion} ›
                    </Button>
                  </div>
                )}
                <CatalogFilters
                  defaultSortLabel="По релевантности"
                  filters={filters}
                  categories={data.categories.filter((c) => !c.parentId && c.hasProducts)}
                  brands={data.brands}
                  currency={data.offers.currency}
                  count={data.count}
                  previewCount={preview.data?.count ?? null}
                  pending={!!draft && preview.isFetching}
                  onDraft={setDraft}
                  onApply={apply}
                />
                {!data.count && (
                  <EmptyState
                    title={
                      hasFilters
                        ? "0 товаров"
                        : data.categories.some((c) => c.hasProducts)
                          ? "Ничего не нашли"
                          : "В магазине пока нет товаров"
                    }
                    description={
                      hasFilters
                        ? "Измените цену или сбросьте фильтры"
                        : "Попробуйте другое название, бренд или категорию"
                    }
                    action={hasFilters ? "Сбросить фильтры" : undefined}
                    onAction={hasFilters ? () => apply({}) : undefined}
                  />
                )}
                {!!tiles.length && (
                  <>
                    {data.count === 0 && <h2 className="text-title-3">Другие товары магазина</h2>}
                    {data.count > tiles.length && (
                      <p className="text-meta text-muted-foreground">
                        Показано {tiles.length} из {data.count}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {tiles.map(({ id, ...tile }) => (
                        <div key={id} className="min-w-0">
                          <ProductTile {...tile} photoShape="square" onOpen={() => remember(query)} />
                          {data.count > 0 && asksForPackSize(q) && !data.preferred[id] && (
                            <p className="mt-1 text-small text-muted-foreground">Проверьте фасовку</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </CatalogTemplate>
      {params.variants && <VariantsSheet id={params.variants} />}
    </>
  );
}
