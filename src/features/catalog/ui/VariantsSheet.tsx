import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { QueryBoundary } from "../../../app/shell/QueryBoundary";
import { AddToCart } from "../../../ui/AddToCart";
import { Price } from "../../../ui/Price";
import { Sheet } from "../../../ui/Sheet";
import { useCart } from "../../cart";
import { useProduct } from "../product-api";

export function VariantsSheet({ id }: { id: string }) {
  const product = useProduct(id);
  const cart = useCart();
  const navigate = useNavigate();
  const router = useRouter();
  const search = useSearch({ strict: false });
  return (
    <Sheet
      open
      title="Выберите фасовку"
      onOpenChange={(open) => {
        if (!open) {
          if ((router.state.location.state.__TSR_index ?? 0) > 0) router.history.back();
          else
            void navigate({ to: ".", search: { ...search, variants: undefined }, replace: true, resetScroll: false });
        }
      }}
    >
      <QueryBoundary query={product} template="list">
        {(data) => (
          <div className="space-y-3">
            <h2 className="text-title-3">{data.name}</h2>
            {data.variants.map((variant) => {
              const value = cart.query.data?.lines.find((line) => line.variantId === variant.id)?.quantity ?? 0;
              return (
                <div key={variant.id} className="space-y-2 rounded-lg bg-input p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span>{variant.name}</span>
                    <Price
                      currency={data.currency}
                      amountMinor={variant.priceMinor}
                      oldMinor={variant.oldPriceMinor ?? undefined}
                    />
                  </div>
                  {variant.available ? (
                    <AddToCart
                      value={value}
                      max={variant.stock ?? 999}
                      disabled={cart.mutation.isPending || !cart.query.data}
                      loading={cart.mutation.isPending && cart.mutation.variables?.line.variantId === variant.id}
                      onChange={(quantity) =>
                        cart.change(
                          {
                            variantId: variant.id,
                            productId: data.id,
                            name: data.name,
                            unit: variant.name,
                            quantity: value,
                            priceMinor: variant.priceMinor,
                            stock: variant.stock,
                            available: variant.available,
                          },
                          quantity,
                        )
                      }
                    />
                  ) : (
                    <p className="text-small text-muted-foreground">Нет в наличии</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </QueryBoundary>
    </Sheet>
  );
}
