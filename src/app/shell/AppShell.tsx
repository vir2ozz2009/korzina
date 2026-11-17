import { Outlet, useRouterState } from "@tanstack/react-router";
import { lazy, Suspense, type TouchEvent, useEffect, useRef } from "react";
import { CartProvider } from "../../features/cart";
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

const SellerTabs = lazy(() => import("./SellerTabs").then((module) => ({ default: module.SellerTabs })));

export function AppShell() {
  useViewport();
  const back = useBack();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const isRoot = useRouterState({ select: (state) => state.matches.at(-1)?.staticData.root ?? false });
  const seller = path.startsWith("/seller");
  const floating = path === "/" || /^\/p\//.test(path);
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
                {bootstrap && bootstrap.status !== "active" ? (
                  <EmptyState title="Магазин временно закрыт" description="Загляните позже." />
                ) : (
                  <Outlet />
                )}
              </Transition>
              {seller && (
                <Suspense fallback={<div className="min-h-16" />}>
                  <SellerTabs />
                </Suspense>
              )}
              {floating && bootstrap?.status === "active" && <ShopActions product={path !== "/"} />}
            </div>
          </ShopNavigation>
        </CartProvider>
      </ToastProvider>
    </FeatureProvider>
  );
}
