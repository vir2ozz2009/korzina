import { useNavigate, useSearch } from "@tanstack/react-router";
import { History, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CatalogTemplate } from "../../../app/templates/CatalogTemplate";
import type { CatalogFilters as Filters } from "../../../shared/contracts/catalog-list";
import { Button } from "../../../ui/Button";
import { EmptyState } from "../../../ui/EmptyState";
import { IconButton } from "../../../ui/IconButton";
import { ProductTile } from "../../../ui/ProductTile";
import { StorefrontState } from "../../../ui/StorefrontState";
import { useCart } from "../../cart";
import { readFilterParams } from "../filter-params";
import { useProductList } from "../list-api";
import { storefrontProducts } from "../model";
import { useCatalogSearch } from "../search-api";
import { useSearchHistory } from "../search-history";
import { CatalogFilters } from "./CatalogFilters";
import { toTiles } from "./toTiles";
import { VariantsSheet } from "./VariantsSheet";

export function SearchScreen() {
  const params = useSearch({ from: "/search" });
  const navigate = useNavigate({ from: "/search" });
  const [draft, setDraft] = useState<Filters>();
  const [query, setQuery] = useState(params.q ?? "");
  const field = useRef<HTMLInputElement>(null);
  const { history, remember, clear: clearHistory } = useSearchHistory(params.shop ?? window.location.hostname);
  const focusOnEntry = useRef(!params.q);
  const filters = readFilterParams(params);
  const q = (params.q ?? "").trim();
  const queryActive = q.length >= 2;
  const result = useCatalogSearch(q, filters);
  const preview = useCatalogSearch(
    q,
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
    if (focusOnEntry.current) field.current?.focus();
  }, []);
  useEffect(() => {
    if (query.trim() === q) return;
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
  }, [navigate, q, query]);
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
        <form
          className="flex min-h-11 items-center gap-2 rounded-pill bg-card px-3"
          onSubmit={(event) => {
            event.preventDefault();
            remember(query);
            field.current?.blur();
          }}
        >
          <Search size={20} className="shrink-0" />
          <input
            ref={field}
            data-search-input
            aria-label="Поиск товаров"
            type="search"
            maxLength={180}
            className="min-w-0 grow bg-transparent text-body outline-none [&::-webkit-search-cancel-button]:hidden"
            placeholder="Товар, бренд или категория"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <IconButton type="button" aria-label="Очистить запрос" onClick={clearQuery}>
              <X size={19} />
            </IconButton>
          )}
        </form>
        {!queryActive ? (
          <div className="space-y-3">
            <p className="text-muted-foreground">Поиск по товарам магазина</p>
            {!!history.length && (
              <section className="space-y-2 rounded-xl bg-card p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-title-3">Недавние запросы</h2>
                  <Button variant="ghost" className="text-primary-text" onClick={clearHistory}>
                    Очистить
                  </Button>
                </div>
                {history.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className="flex min-h-10 items-center gap-2"
                    onClick={() => pick(value)}
                  >
                    <History size={18} />
                    {value}
                  </button>
                ))}
              </section>
            )}
          </div>
        ) : !supported ? (
          <EmptyState title="Введите название товара" description="Поиск понимает названия, бренды и категории" />
        ) : (
          <>
            {offline && <p className="rounded-xl bg-card p-3">Цена и наличие уточнятся при добавлении</p>}
            {(waiting || result.isPending) && !offline && <StorefrontState state="loading" />}
            {result.isError && !waiting && !data && (
              <EmptyState
                title="Не удалось выполнить поиск"
                description="Попробуйте ещё раз. Ваш запрос сохранён"
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
                  <div className="grid grid-cols-2 gap-2">
                    {tiles.map(({ id, ...tile }) => (
                      <ProductTile key={id} {...tile} onOpen={() => remember(query)} />
                    ))}
                  </div>
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
