import { useRouter } from "@tanstack/react-router";
import { lazy, Suspense, useEffect } from "react";
import { telegramLaunch } from "./launch";

const Content = lazy(() => import("./TelegramContent").then((module) => ({ default: module.TelegramContent })));
export function TelegramBridge() {
  const router = useRouter();
  useEffect(
    () =>
      router.subscribe("onResolved", () => {
        document.title = router.state.matches.at(-1)?.staticData.title ?? "Korzina";
      }),
    [router],
  );
  return telegramLaunch ? (
    <Suspense fallback={null}>
      <Content />
    </Suspense>
  ) : null;
}
