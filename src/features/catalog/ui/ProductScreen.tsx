import { Outlet, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { ProductTemplate } from "../../../app/templates/ProductTemplate";
import { AddToCart } from "../../../ui/AddToCart";
import { Card } from "../../../ui/Card";
import { Gallery } from "../../../ui/Gallery";
import { ListItem } from "../../../ui/ListItem";
import { Price } from "../../../ui/Price";
import { useCart } from "../../cart";
import { selectOffer } from "../offer";
import { useProduct } from "../product-api";
import { VariantsSheet } from "./VariantsSheet";

export function ProductScreen() {
  const { id } = useParams({ strict: false }) as { id: string };
  const search = useSearch({ strict: false }) as { variants?: string };
  const product = useProduct(id);
  const cart = useCart();
  const navigate = useNavigate();
  const data = product.data;
  const offer = data ? selectOffer(data.variants, cart.query.data?.lines ?? [], id) : undefined;
  const variant = offer?.variant;
  const multiple = offer?.multiple ?? false;
  const value = offer?.quantity ?? 0;
  const choose = () =>
    void navigate({ to: ".", search: (previous) => ({ ...previous, variants: id }), resetScroll: false });
  return (
    <>
      <ProductTemplate
        title={data?.name ?? "Товар"}
        state={{ query: product }}
        gallery={
          <Gallery
            images={data?.images.map((image) => ({ ...image, src: image.src ?? "" })) ?? []}
            name={data?.name ?? "Товар"}
          />
        }
        info={
          <Card>
            <h1 className="text-title-1">{data?.name}</h1>
            {variant && data && (
              <>
                <p className="text-meta text-muted-foreground">{offer?.unit}</p>
                <Price
                  currency={data.currency}
                  amountMinor={variant.priceMinor}
                  oldMinor={variant.oldPriceMinor ?? undefined}
                  from={offer?.from}
                  size="display"
                />
              </>
            )}
            <ListItem title="Подробнее о товаре" href={`/p/${id}/details`} />
          </Card>
        }
        buyBar={
          data &&
          variant &&
          (variant.available || value > 0 ? (
            <AddToCart
              size="lg"
              value={value}
              max={variant.stock ?? 999}
              disabled={cart.pendingProducts.has(id) || !cart.query.data}
              loading={cart.pendingProducts.has(id)}
              onChooseVariant={multiple ? choose : undefined}
              onChange={(quantity) =>
                cart.change(
                  {
                    variantId: variant.id,
                    productId: id,
                    name: data.name,
                    unit: variant.name,
                    quantity: value,
                    priceMinor: variant.priceMinor,
                    stock: variant.stock,
                    available: variant.available,
                  },
                  quantity,
                  data.currency,
                )
              }
            />
          ) : (
            <p className="text-center text-muted-foreground">Нет в наличии</p>
          ))
        }
      />
      {search.variants && <VariantsSheet id={search.variants} />}
      <Outlet />
    </>
  );
}
