import { useNavigate, useSearch } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { bootstrap } from "../../../app/bootstrap";
import { HomeTemplate } from "../../../app/templates/HomeTemplate";
import { AboutStore } from "../../../ui/AboutStore";
import { Button } from "../../../ui/Button";
import { ErrorState } from "../../../ui/ErrorState";
import { StoreHeader } from "../../../ui/StoreHeader";
import { useCart } from "../../cart";
import { useCatalog, useOffers } from "../api";
import { storefrontProducts } from "../model";
import { HomeView } from "./HomeView";
import { ProductTiles } from "./ProductTiles";

const VariantsSheet = lazy(() => import("./VariantsSheet").then((module) => ({ default: module.VariantsSheet })));

export function HomeScreen() {
  const [version, setVersion] = useState<number>();
  const catalog = useCatalog(version);
  const document = catalog.data?.pages[0];
  const items = catalog.data?.pages.flatMap((page) => page.items) ?? [];
  const offers = useOffers(items.flatMap((product) => product.variants.map((v) => v.id)));
  const cart = useCart();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { variants?: string };
  const products = storefrontProducts(items, offers.data?.items ?? []);
  const availableCategories = new Set(
    products.filter((p) => p.variants.some((v) => v.available)).map((p) => p.categoryId),
  );
  const photos = new Map<string, (typeof products)[number]["image"]>();
  for (const product of products) if (!photos.has(product.categoryId)) photos.set(product.categoryId, product.image);
  const availableBrands = new Set(products.filter((p) => p.variants.some((v) => v.available)).map((p) => p.brandId));
  const error = catalog.error ?? offers.error;
  const pending = catalog.isPending || (items.length > 0 && offers.isPending);
  const query = {
    data: pending || ((catalog.isError || offers.isError) && !products.length) ? undefined : products,
    isPending: pending,
    isError: catalog.isError || offers.isError,
    error,
    refetch: () => Promise.all([catalog.refetch(), offers.refetch()]),
  };
  const mismatch = offers.data && document && offers.data.catalogVersion !== document.catalogVersion;
  // Switch to the exact public version supplied by live rather than the discovery alias.
  if (mismatch && version !== offers.data.catalogVersion) setVersion(offers.data.catalogVersion);
  return (
    <>
      <HomeTemplate
        title={bootstrap?.name ?? "Магазин"}
        header={
          <StoreHeader
            name={bootstrap?.name ?? "Магазин"}
            onAbout={() => void navigate({ to: "/about" })}
            onAddress={() => void navigate({ to: "/addresses" })}
            onChat={() => void navigate({ to: "/chat" })}
            onProfile={() => void navigate({ to: "/login" })}
          />
        }
        after={<AboutStore onClick={() => void navigate({ to: "/about" })} />}
        state={{
          query,
          empty: !pending && !products.length && !catalog.hasNextPage,
          emptyTitle: "Товары скоро появятся",
          emptyDescription: "Загляните чуть позже — здесь появятся товары.",
        }}
        sections={[
          <HomeView
            key="catalog"
            categories={(document?.categories ?? [])
              .filter((category) => !category.parentId && availableCategories.has(category.id))
              .map((category) => ({ ...category, image: photos.get(category.id) ?? category.image ?? undefined }))}
            products={ProductTiles({
              products,
              currency: offers.data?.currency ?? "RUB",
              cart,
              choose: (id) =>
                void navigate({ to: "/", search: (previous) => ({ ...previous, variants: id }), resetScroll: false }),
            })}
            brands={(document?.brands ?? []).filter((brand) => availableBrands.has(brand.id))}
          />,
          cart.query.isError && (
            <ErrorState key="cart-error" error={cart.query.error} onRetry={() => void cart.query.refetch()} />
          ),
          catalog.isFetchNextPageError && (
            <ErrorState key="page-error" error={catalog.error} onRetry={() => void catalog.fetchNextPage()} />
          ),
          catalog.hasNextPage && (
            <Button
              key="more"
              full
              variant="secondary"
              loading={catalog.isFetchingNextPage}
              onClick={() => void catalog.fetchNextPage()}
            >
              Показать ещё
            </Button>
          ),
        ]}
      />
      {search.variants && (
        <Suspense fallback={null}>
          <VariantsSheet id={search.variants} />
        </Suspense>
      )}
    </>
  );
}
