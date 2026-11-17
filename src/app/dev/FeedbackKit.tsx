import { useEffect, useRef, useState } from "react";
import { Button } from "../../ui/Button";
import { ChipGroup } from "../../ui/ChipGroup";
import { Dialog } from "../../ui/Dialog";
import { EmptyState } from "../../ui/EmptyState";
import { ErrorState } from "../../ui/ErrorState";
import { KitSection } from "../../ui/KitSection";
import { Sheet } from "../../ui/Sheet";
import { Skeleton } from "../../ui/Skeleton";
import { SkeletonBlock } from "../../ui/SkeletonBlock";
import { SkeletonRow } from "../../ui/SkeletonRow";
import { SkeletonText } from "../../ui/SkeletonText";
import { SkeletonTile } from "../../ui/SkeletonTile";
export function FeedbackKit({ notify }: { notify: (message: string) => void }) {
  const [state, setState] = useState("error");
  const [sheet, setSheet] = useState(false);
  const [dialog, setDialog] = useState(false);
  const retry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(retry.current), []);
  function reload() {
    setState("loading");
    clearTimeout(retry.current);
    retry.current = setTimeout(() => {
      setState("ready");
      notify("Данные загружены");
    }, 800);
  }
  return (
    <div className="space-y-3">
      <KitSection title="Состояния экрана">
        <ChipGroup
          label="Состояние экрана"
          value={state}
          onChange={setState}
          options={[
            { value: "loading", label: "Загрузка" },
            { value: "empty", label: "Пусто" },
            { value: "error", label: "Ошибка" },
            { value: "ready", label: "Готово" },
          ]}
        />
        {state === "loading" && (
          <div role="status" aria-label="Загрузка данных" className="space-y-3">
            <Skeleton className="h-40" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton />
            <Skeleton className="h-11 rounded-pill" />
          </div>
        )}
        {state === "empty" && (
          <EmptyState
            title="В корзине пока пусто"
            description="Добавьте продукты, которые любите."
            action="За покупками"
            onAction={() => setState("ready")}
          />
        )}
        {state === "error" && <ErrorState onRetry={reload} />}
        {state === "ready" && (
          <EmptyState
            title="Всё готово"
            description="Повторная загрузка прошла успешно."
            action="Обновить"
            onAction={reload}
          />
        )}
      </KitSection>
      <KitSection title="Скелетоны по форме контента">
        <div role="status" aria-label="Примеры скелетонов" className="space-y-3">
          <SkeletonText size="title" short />
          <SkeletonText />
          <SkeletonBlock className="h-20" />
          <div className="grid grid-cols-2 gap-2">
            <SkeletonTile />
            <SkeletonTile />
          </div>
          <SkeletonRow />
        </div>
      </KitSection>
      <KitSection title="Шторка и диалог">
        <Button full variant="secondary" onClick={() => setSheet(true)}>
          Открыть шторку
        </Button>
        <Button full variant="secondary" onClick={() => setDialog(true)}>
          Удалить · подтверждение
        </Button>
        <Button full variant="soft" onClick={() => notify("Изменения сохранены")}>
          Показать тост на 3 секунды
        </Button>
        <Button full variant="soft" onClick={() => notify("Изменения сохранены · можно отменить")}>
          Тост с действием
        </Button>
      </KitSection>
      <KitSection title="Ошибка по коду">
        <ErrorState code="STOCK_CHANGED" onRetry={reload} />
      </KitSection>
      <Sheet
        open={sheet}
        onOpenChange={setSheet}
        title="Условия доставки"
        description="Пример шторки. Потяните вниз или нажмите закрыть."
      >
        <p className="mb-4 text-meta">Доставляем каждый день с 10:00 до 20:00.</p>
        <Button full onClick={() => setSheet(false)}>
          Понятно
        </Button>
      </Sheet>
      <Dialog
        open={dialog}
        onOpenChange={setDialog}
        title="Удалить товар?"
        description="Товар будет удалён из примера. Это демонстрация подтверждения."
        onConfirm={() => {
          setDialog(false);
          notify("Товар удалён из примера");
        }}
      />
    </div>
  );
}
