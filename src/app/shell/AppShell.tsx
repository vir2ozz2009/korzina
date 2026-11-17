import { Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { lazy, Suspense, type TouchEvent, useEffect, useRef } from "react";
import { FeatureProvider } from "../../shared/useFeature";
import { FloatingActions } from "../../ui/FloatingActions";
import { bootstrap } from "../bootstrap";
import { TelegramBridge } from "../telegram/TelegramBridge";
import { ToastProvider } from "./ToastProvider";
import { Transition } from "./Transition";
import { useBack } from "./useBack";
import { useViewport } from "./useViewport";

const SellerTabs = lazy(() => import("./SellerTabs").then((module) => ({ default: module.SellerTabs })));

export function AppShell() {
  useViewport();
  const router = useRouter();
  const back = useBack();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const isRoot = useRouterState({ select: (state) => state.matches.at(-1)?.staticData.root ?? false });
  const seller = path.startsWith("/seller");
  const floating = import.meta.env.DEV_SCREENS && (path === "/" || /^\/p\//.test(path));
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
        <TelegramBridge />
        <div
          className="app-shell"
          data-seller={seller}
          onTouchStart={(event) => {
            const touch = event.touches[0];
            start.current = touch?.clientX < 24 ? { x: touch.clientX, y: touch.clientY } : null;
          }}
          onTouchEnd={endSwipe}
        >
          <Transition>
            <Outlet />
          </Transition>
          {seller && (
            <Suspense fallback={<div className="min-h-16" />}>
              <SellerTabs />
            </Suspense>
          )}
          {floating && (
            <div
              className={`pointer-events-none fixed inset-x-3 z-20 mx-auto max-w-(--content-max) ${path === "/" ? "bottom-[calc(1rem+var(--safe-bottom))]" : "bottom-[calc(var(--control-lg)+2rem+var(--safe-bottom))]"}`}
            >
              <div className="pointer-events-auto px-3">
                <FloatingActions
                  count={1}
                  totalMinor={18900}
                  onSearch={() => void router.navigate({ to: "/dev/templates/catalog" })}
                  onCart={() => void router.navigate({ to: "/dev/templates/checkout" })}
                />
              </div>
            </div>
          )}
        </div>
      </ToastProvider>
    </FeatureProvider>
  );
}
