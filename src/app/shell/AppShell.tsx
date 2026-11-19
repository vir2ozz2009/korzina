import { Outlet, useRouterState } from "@tanstack/react-router";
import { type TouchEvent, useEffect, useRef } from "react";
import { CartProvider } from "../../features/cart";
import { FavoritesProvider } from "../../features/favorites";
import { FeatureProvider } from "../../shared/useFeature";
import { EmptyState } from "../../ui/EmptyState";
import { bootstrap } from "../bootstrap";
import { TelegramBridge } from "../telegram/TelegramBridge";
import { ShopActions } from "./ShopActions";
import { ShopNavigation } from "./ShopNavigation";
import { ToastProvider } from "./ToastProvider";
import { Transition } from "./Transition";
import { useBack } from "./useBack";
import { useViewport } from "./useViewport";

export function AppShell() {
  const keyboardOpen = useViewport();
  const back = useBack();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const isRoot = useRouterState({ select: (state) => state.matches.at(-1)?.staticData.root ?? false });
  const seller = path.startsWith("/seller");
  const storefrontClosed =
    bootstrap &&
    ["draft", "paused"].includes(bootstrap.status) &&
    !seller &&
    !/^\/(admin|orders|order|profile)(\/|$)/.test(path);
  const compactCart =
    path.startsWith("/p/") || path === "/favorites" || path === "/profile" || path.startsWith("/profile/");
  const floating =
    !seller &&
    !["/admin", "/dev", "/cart", "/checkout", "/order", "/orders"].some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    );
  const start = useRef<{ x: number; y: number } | null>(null);
  const previousPath = useRef(path);
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
              <div
                className={`mx-auto min-h-(--app-height) max-w-(--content-max) overflow-x-clip pt-(--safe-top) pl-(--safe-left) pr-(--safe-right) pb-[calc(var(--tab-height)+var(--safe-bottom))] ${seller ? "[--tab-height:var(--seller-tab-height)]" : ""}`}
                data-seller={seller}
                onTouchStart={(event) => {
                  const touch = event.touches[0];
                  start.current = touch?.clientX < 24 ? { x: touch.clientX, y: touch.clientY } : null;
                }}
                onTouchEnd={endSwipe}
              >
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
                {floating && !keyboardOpen && bootstrap?.status === "active" && (
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
