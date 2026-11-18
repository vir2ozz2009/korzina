import { useNavigate, useSearch } from "@tanstack/react-router";
import { lazy, type ReactNode, Suspense } from "react";
import { CatalogTemplate } from "../../../app/templates/CatalogTemplate";
import type { CatalogScope } from "../../../shared/contracts/catalog-list";
import { HttpError } from "../../../shared/http-error";
import { ErrorState } from "../../../ui/AsyncErrorState";
import { BrandTile } from "../../../ui/BrandTile";
import { Chip } from "../../../ui/Chip";
import { EmptyState } from "../../../ui/EmptyState";
import { ProductTile } from "../../../ui/ProductTile";
import { useCart } from "../../cart";
import { useProductList } from "../list-api";
import { storefrontProducts } from "../model";
import { toTiles } from "./toTiles";

const VariantsSheet = lazy(() => import("./VariantsSheet").then((module) => ({ default: module.VariantsSheet })));
export function ProductList({
  scope,
  categoryId,
  onSelect,
}: {
  scope: CatalogScope;
  categoryId?: string;
  onSelect?: (id?: string) => void;
}) {
  const list = useProductList(scope);
  const document = list.data?.pages[0];
  const navigate = useNavigate();
  const cart = useCart();
  const search = useSearch({ strict: false }) as { variants?: string };
  const category = document?.categories.find((item) => item.id === categoryId);
  const brand = scope.startsWith("brand:") ? document?.brands.find((item) => item.id === scope.slice(6)) : undefined;
  const selected = scope.startsWith("category:") ? scope.slice(9) : undefined;
  const invalid =
    !!document &&
    !!categoryId &&
    (!category ||
      (selected !== categoryId &&
        !document.categories.some((item) => item.id === selected && item.parentId === categoryId)));
  const products = (list.data?.pages ?? []).flatMap((page) => storefrontProducts(page.items, page.offers.items));
  const unavailable = invalid || (list.error instanceof HttpError && list.error.status === 404);
  const home = () => void navigate({ to: "/" });
  let content: ReactNode = null;
  if (unavailable)
    content = <EmptyState title="Раздел недоступен" description="" action="На главную" onAction={home} />;
  else
    content =
      document &&
      toTiles({
        products,
        currency: document.offers.currency,
        cart,
        choose: (id) =>
          void navigate({ to: ".", search: (previous) => ({ ...previous, variants: id }), resetScroll: false }),
      }).map(({ id, ...props }) => <ProductTile key={id} {...props} />);
  return (
    <>
      <CatalogTemplate
        title={category?.name ?? brand?.name ?? "Каталог"}
        layout={unavailable ? "list" : "grid"}
        state={
          unavailable
            ? undefined
            : {
                query: list,
                empty: !list.isPending && !products.length && !list.hasNextPage,
                emptyTitle: "Здесь пока пусто",
                emptyDescription: "",
                onEmpty: home,
              }
        }
        toolbar={
          !unavailable && (
            <>
              {brand && (
                <div className="flex items-center gap-3 rounded-xl bg-card p-3">
                  <BrandTile
                    name={brand.name}
                    logo={typeof brand.image === "string" ? brand.image : brand.image?.src}
                  />
                  <span className="min-w-0 text-title-3">{brand.name}</span>
                </div>
              )}
              {category && onSelect && (
                <nav className="flex gap-2 overflow-x-auto" aria-label="Подкатегории">
                  <Chip selected={selected === categoryId} onClick={() => onSelect()}>
                    Все
                  </Chip>
                  {document?.categories
                    .filter((item) => item.parentId === categoryId && item.hasProducts)
                    .map((item) => (
                      <Chip key={item.id} selected={selected === item.id} onClick={() => onSelect(item.id)}>
                        {item.name}
                      </Chip>
                    ))}
                </nav>
              )}
            </>
          )
        }
        onLoadMore={!unavailable && list.hasNextPage ? () => void list.fetchNextPage() : undefined}
        loadingMore={list.isFetchingNextPage}
      >
        {content}
      </CatalogTemplate>
      {list.isFetchNextPageError && <ErrorState error={list.error} onRetry={() => void list.fetchNextPage()} />}
      {cart.query.isError && <ErrorState error={cart.query.error} onRetry={() => void cart.query.refetch()} />}
      {search.variants && (
        <Suspense fallback={null}>
          <VariantsSheet id={search.variants} />
        </Suspense>
      )}
    </>
  );
}
