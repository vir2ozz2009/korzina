import { CheckoutTemplate } from "../../../app/templates/CheckoutTemplate";
import { formatMinor } from "../../../shared/money";
import { EmptyState } from "../../../ui/EmptyState";
import { ListItem } from "../../../ui/ListItem";
import { useCart } from "../CartProvider";

export function CartScreen() {
  const { query } = useCart();
  const cart = query.data;
  return (
    <CheckoutTemplate
      title="Корзина"
      state={{ query }}
      sections={[
        cart?.lines.length ? (
          <div key="lines" className="space-y-2">
            {cart.lines.map((line) => (
              <ListItem
                key={line.variantId}
                title={line.name}
                subtitle={`${line.unit} · ${line.quantity} шт.`}
                value={formatMinor(line.priceMinor, cart.currency)}
                href={`/p/${line.productId}`}
              />
            ))}
          </div>
        ) : (
          <EmptyState key="empty" title="Корзина пуста" description="Добавьте товары на главной магазина." />
        ),
      ]}
      summary={
        cart && cart.count > 0 ? <ListItem title="Товары" value={formatMinor(cart.totalMinor, cart.currency)} /> : null
      }
      cta="Оформление скоро появится"
    />
  );
}
