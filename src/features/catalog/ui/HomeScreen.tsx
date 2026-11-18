import { useNavigate, useSearch } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { bootstrap } from "../../../app/bootstrap";
import { telegramLaunch } from "../../../app/telegram/launch";
import { HomeTemplate } from "../../../app/templates/HomeTemplate";
import { HttpError } from "../../../shared/http-error";
import { AboutStore } from "../../../ui/AboutStore";
import { ErrorState } from "../../../ui/AsyncErrorState";
import { Button } from "../../../ui/Button";
import { StoreHeader } from "../../../ui/StoreHeader";
import { useCart } from "../../cart";
import { ContactSheet, useContact } from "../../contact";
import { useCatalog, useOffers } from "../api";
import { storefrontProducts } from "../model";
import { HomeView } from "./HomeView";
import { toTiles } from "./toTiles";

const VariantsSheet = lazy(() => import("./VariantsSheet").then((module) => ({ default: module.VariantsSheet })));

export function HomeScreen() {
  const [login, setLogin] = useState(false);
  const contact = useContact(false);
  const [version, setVersion] = useState<number>();
  const catalog = useCatalog(version);
  const document = catalog.data?.pages[0];
  const items = catalog.data?.pages.flatMap((page) => page.items) ?? [];
  const offers = useOffers(catalog.data?.pages ?? []);
  const cart = useCart();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { variants?: string };
  const products = storefrontProducts(items, offers.data?.items ?? []);
  const error = catalog.error ?? offers.error;
  const reordered =
    catalog.isFetchNextPageError && catalog.error instanceof HttpError && catalog.error.code === "VERSION_CONFLICT";
  const pending = catalog.isPending || (items.length > 0 && offers.isPending && !products.length);
  const query = {
    data: pending || ((catalog.isError || offers.isError) && !products.length) ? undefined : products,
    isPending: pending,
    isError: catalog.isError || offers.isError,
    error,
    refetch: () => Promise.all([catalog.refetch(), offers.refetch()]),
  };
  const mismatch = offers.data && document && offers.data.catalogVersion > document.catalogVersion;
  // Switch to the exact public version supplied by live rather than the discovery alias.
  const liveVersion = offers.data?.catalogVersion;
  useEffect(() => {
    if (mismatch && liveVersion !== version) setVersion(liveVersion);
  }, [mismatch, liveVersion, version]);
  return (
    <>
      <HomeTemplate
        title={bootstrap?.name ?? "Магазин"}
        header={
          <StoreHeader
            name={bootstrap?.name ?? "Магазин"}
            onAbout={() => void navigate({ to: "/about" })}
            onProfile={
              telegramLaunch || contact.data?.phone || contact.data?.telegramLinked ? undefined : () => setLogin(true)
            }
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
            allProductsHref="/catalog"
            categories={(document?.categories ?? [])
              .filter((category) => !category.parentId && category.hasProducts)
              .map((category) => ({ ...category, image: category.image ?? undefined }))}
            products={
              offers.data
                ? toTiles({
                    products,
                    currency: offers.data.currency,
                    cart,
                    choose: (id) =>
                      void navigate({
                        to: "/",
                        search: (previous) => ({ ...previous, variants: id }),
                        resetScroll: false,
                      }),
                  })
                : []
            }
            moreProducts={
              reordered ? (
                <div className="space-y-2">
                  <p role="status">Каталог обновился. Обновите список.</p>
                  <Button full variant="secondary" onClick={() => void offers.refetch()}>
                    Обновить список
                  </Button>
                </div>
              ) : catalog.isFetchNextPageError ? (
                <ErrorState error={catalog.error} onRetry={() => void catalog.fetchNextPage()} />
              ) : catalog.hasNextPage ? (
                <Button
                  full
                  variant="secondary"
                  loading={catalog.isFetchingNextPage}
                  onClick={() => void catalog.fetchNextPage()}
                >
                  Показать ещё
                </Button>
              ) : undefined
            }
            brands={(document?.brands ?? []).filter((brand) => brand.hasProducts)}
          />,
          cart.query.isError && (
            <ErrorState key="cart-error" error={cart.query.error} onRetry={() => void cart.query.refetch()} />
          ),
        ]}
      />
      <ContactSheet mode={login ? "telegram" : undefined} close={() => setLogin(false)} />
      {search.variants && (
        <Suspense fallback={null}>
          <VariantsSheet id={search.variants} />
        </Suspense>
      )}
    </>
  );
}
