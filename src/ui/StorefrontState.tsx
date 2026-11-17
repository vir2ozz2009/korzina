import { Button } from "./Button";
import { SkeletonTile } from "./SkeletonTile";
export function StorefrontState({ state, onRetry }: { state: "loading" | "empty" | "error"; onRetry?: () => void }) {
  if (state === "loading")
    return (
      <div role="status" aria-label="Загрузка товаров" className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <SkeletonTile />
          <SkeletonTile />
          <SkeletonTile />
          <SkeletonTile />
        </div>
      </div>
    );
  return (
    <section className="space-y-3 rounded-xl bg-card p-6">
      <h1 className="text-title-2">{state === "empty" ? "Товары скоро появятся" : "Не удалось загрузить товары"}</h1>
      {state === "error" && (
        <Button full onClick={onRetry}>
          Попробовать снова
        </Button>
      )}
    </section>
  );
}
