import { CircleAlert } from "lucide-react";
import type { ErrorCode } from "../shared/errors";
import { EmptyState } from "./EmptyState";

const messages: Partial<Record<ErrorCode, string>> = {
  STOCK_CHANGED: "Количество товара изменилось. Обновите данные.",
  PRICE_CHANGED: "Цена изменилась. Проверьте заказ ещё раз.",
  FORBIDDEN: "У вас нет доступа к этому действию.",
  UNAUTHORIZED: "Войдите, чтобы продолжить.",
  NOT_FOUND: "Здесь пока ничего нет.",
  RATE_LIMITED: "Слишком много запросов. Попробуйте чуть позже.",
};
export function ErrorState({ code = "INTERNAL", onRetry }: { code?: ErrorCode; onRetry: () => void }) {
  return (
    <div role="alert">
      <EmptyState
        title="Не удалось загрузить"
        description={messages[code] ?? "Проверьте соединение и попробуйте ещё раз."}
        icon={<CircleAlert size={48} />}
        action="Повторить"
        onAction={onRetry}
      />
    </div>
  );
}
