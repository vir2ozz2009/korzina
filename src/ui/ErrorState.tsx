import { CircleAlert, LockKeyhole } from "lucide-react";
import type { ErrorCode } from "../shared/errors";
import { errorKind } from "../shared/http-error";
import { EmptyState } from "./EmptyState";

const messages: Partial<Record<ErrorCode, string>> = {
  STOCK_CHANGED: "Количество товара изменилось. Обновите данные.",
  PRICE_CHANGED: "Цена изменилась. Проверьте заказ ещё раз.",
  FORBIDDEN: "У вас нет доступа к этому действию.",
  UNAUTHORIZED: "Войдите, чтобы продолжить.",
  NOT_FOUND: "Здесь пока ничего нет.",
  RATE_LIMITED: "Слишком много запросов. Попробуйте чуть позже.",
};
export function ErrorState({ code, error, onRetry }: { code?: ErrorCode; error?: unknown; onRetry?: () => void }) {
  const kind = errorKind(error ?? { code: code ?? "INTERNAL" });
  if (kind === "access")
    return (
      <div role="alert">
        <EmptyState
          title="Нужно войти как продавец"
          description="скоро"
          icon={<LockKeyhole size={48} />}
          action="Войти"
          actionDisabled
        />
      </div>
    );
  return (
    <div role="alert">
      <EmptyState
        title="Не удалось загрузить"
        description={
          (code && messages[code]) ||
          (error instanceof Error ? error.message : "Проверьте соединение и попробуйте ещё раз.")
        }
        icon={<CircleAlert size={48} />}
        action={kind === "retry" && onRetry ? "Повторить" : undefined}
        onAction={kind === "retry" ? onRetry : undefined}
      />
    </div>
  );
}
