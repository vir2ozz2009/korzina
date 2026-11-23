import { Outlet, useRouterState } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { lazy, Suspense, type TouchEvent, useEffect, useRef } from "react";
import { CartProvider } from "../../features/cart";
import { FavoritesProvider } from "../../features/favorites";
import { FeatureProvider } from "../../shared/useFeature";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { bootstrap, buyerStorefrontOpen } from "../bootstrap";
import { cabinetStorefront, restoreCabinetPosition, returnToCabinet } from "../cabinet-storefront";
import { TelegramBridge } from "../telegram/TelegramBridge";
import { ShopActions } from "./ShopActions";
import { ShopNavigation } from "./ShopNavigation";
import { ToastProvider } from "./ToastProvider";
import { Transition } from "./Transition";
import { useBack } from "./useBack";
import { useViewport } from "./useViewport";

const SellerOrderUpdates = lazy(() =>
  import("../../features/seller/useSellerOrdersLive").then(({ SellerOrderUpdates }) => ({
    default: SellerOrderUpdates,
  })),
);

const BuyerOrderUpdates = lazy(() =>
  import("../../features/order-chat/BuyerOrderUpdates").then(({ BuyerOrderUpdates }) => ({
    default: BuyerOrderUpdates,
  })),
);
export function AppShell() {
  const keyboardOpen = useViewport();
  const back = useBack();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const isRoot = useRouterState({ select: (state) => state.matches.at(-1)?.staticData.root ?? false });
  const seller = path.startsWith("/seller");
  const viewer = !seller && !!cabinetStorefront;
  const storefrontClosed =
    !seller &&
    ((viewer && !bootstrap) ||
      (bootstrap?.status === "draft" && !buyerStorefrontOpen) ||
      (bootstrap?.status === "paused" && !/^\/(admin|orders|order|profile|chats)(\/|$)/.test(path))) &&
    !path.startsWith("/admin");
  const compactCart =
    path.startsWith("/p/") || path === "/favorites" || path === "/profile" || path.startsWith("/profile/");
  const floating =
    !seller &&
    !["/admin", "/dev", "/cart", "/checkout", "/order", "/orders", "/chats"].some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    );
  const start = useRef<{ x: number; y: number } | null>(null);
  const previousPath = useRef(viewer ? "" : path);
  useEffect(() => {
    const frame = requestAnimationFrame(() => restoreCabinetPosition(path));
    return () => cancelAnimationFrame(frame);
  }, [path]);
  useEffect(() => {
    // Initial theme is already in the server HTML. Load theme editing only on navigation.
    if (previousPath.current === path) return;
    previousPath.current = path;
    let active = true;
    void Promise.all([import("../../shared/apply-theme"), import("../../shared/theme-presets")]).then(
      ([{ applyTheme }, { normalizeTheme }]) => {
        if (active) applyTheme(normalizeTheme(seller || path.startsWith("/admin") ? undefined : bootstrap?.theme));
      },
    );
    return () => {
      active = false;
    };
  }, [seller, path]);
  const endSwipe = (event: TouchEvent) => {
    const touch = event.changedTouches[0];
    if (
      start.current &&
      touch &&
      touch.clientX - start.current.x > 80 &&
      Math.abs(touch.clientY - start.current.y) < 60 &&
      !isRoot
    )
      back();
    start.current = null;
  };
  return (
    <FeatureProvider shop={bootstrap}>
      <ToastProvider>
        <CartProvider>
          <FavoritesProvider>
            <ShopNavigation>
              <TelegramBridge />
              <Suspense fallback={null}>
                {seller ? <SellerOrderUpdates /> : bootstrap && <BuyerOrderUpdates />}
              </Suspense>
              <div
                className={`mx-auto min-h-(--app-height) max-w-(--content-max) overflow-x-clip pt-(--safe-top) pl-(--safe-left) pr-(--safe-right) pb-[calc(var(--tab-height)+var(--safe-bottom))] ${seller ? "[--tab-height:var(--seller-tab-height)]" : ""}`}
                data-seller={seller}
                onTouchStart={(event) => {
                  const touch = event.touches[0];
                  start.current = touch?.clientX < 24 ? { x: touch.clientX, y: touch.clientY } : null;
                }}
                onTouchEnd={endSwipe}
              >
                {viewer && (
                  <header className="border-b border-border bg-card px-(--page-x) pb-2">
                    <Button
                      variant="ghost"
                      className="-ml-3"
                      icon={<ArrowLeft aria-hidden size={18} />}
                      onClick={returnToCabinet}
                    >
                      Вернуться в кабинет
                    </Button>
                    <h1 className="text-title-3">Витрина глазами покупателя</h1>
                  </header>
                )}
                {!seller && buyerStorefrontOpen && (viewer || bootstrap?.teamPreview) && (
                  <p className="bg-primary-soft px-(--page-x) py-2 text-small font-medium text-primary-text">
                    Предпросмотр для команды
                  </p>
                )}
                <Transition>
                  {storefrontClosed ? (
                    <EmptyState
                      title={
                        bootstrap?.status === "paused"
                          ? "Магазин временно не принимает заказы"
                          : "Магазин скоро откроется"
                      }
                      description="Загляните позже."
                    />
                  ) : (
                    <Outlet />
                  )}
                </Transition>
                {floating && !keyboardOpen && buyerStorefrontOpen && (
                  <ShopActions compact={compactCart} search={path !== "/search"} />
                )}
              </div>
            </ShopNavigation>
          </FavoritesProvider>
        </CartProvider>
      </ToastProvider>
    </FeatureProvider>
  );
}
