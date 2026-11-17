import { lazy, Suspense } from "react";
import { bootstrap } from "./bootstrap";

const UiKit = lazy(() => import("./dev/UiKit"));

export function App() {
  if (location.pathname === "/dev/kit")
    return (
      <Suspense fallback={<p className="p-6 text-body">Загружаем UI-кит…</p>}>
        <UiKit />
      </Suspense>
    );
  return (
    <main className="mx-auto min-h-dvh max-w-(--content-max) space-y-4 px-(--page-x) py-6">
      <div className="space-y-4 rounded-xl bg-card p-5">
        <img src="/brand/korzina.svg" alt="" className="size-12" />
        <h1 className="text-title-2">Korzina</h1>
        <p className="text-body text-foreground-body">{bootstrap?.name ?? "Платформа для ваших магазинов"}</p>
        <a
          href={`/dev/kit${location.search}`}
          className="block rounded-pill bg-primary px-5 py-3 text-center text-label text-primary-foreground"
        >
          UI-кит Korzina
        </a>
      </div>
    </main>
  );
}
