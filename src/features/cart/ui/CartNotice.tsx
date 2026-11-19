import type { Cart } from "../../../shared/contracts/cart";
import { formatMinor } from "../../../shared/money";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";

export function CartNotice({
  cart,
  checking,
  error,
  confirmed,
  retry,
}: {
  cart: Cart | undefined;
  checking: boolean;
  error: boolean;
  confirmed: boolean;
  retry: () => void;
}) {
  if (checking && cart?.lines.length)
    return (
      <Card className="bg-status-warning!" role="status">
        <p className="text-label">Проверяем корзину…</p>
        <p className="text-meta text-muted-foreground">Уточняем цены и наличие товаров.</p>
      </Card>
    );
  if (error)
    return (
      <Card className="bg-status-danger! text-status-danger-foreground" role="alert">
        <p className="text-label">Не удалось проверить корзину</p>
        <Button variant="secondary" onClick={retry}>
          Повторить проверку
        </Button>
      </Card>
    );
  if (cart?.review && cart.currency)
    return (
      <Card className="bg-status-warning!" role="status">
        <p className="text-label">В корзине изменились условия</p>
        <p className="text-body">
          Итог: <del>{formatMinor(cart.review.beforeMinor, cart.currency)}</del> →{" "}
          <strong>{formatMinor(cart.totalMinor, cart.currency)}</strong>
        </p>
      </Card>
    );
  if (confirmed && cart?.lines.length)
    return (
      <Card className="bg-status-success!" role="status">
        <p className="text-label">Изменения подтверждены</p>
      </Card>
    );
  return null;
}
