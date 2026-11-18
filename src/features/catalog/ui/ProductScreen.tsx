import { Link, Outlet, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Share2 } from "lucide-react";
import { useState } from "react";
import { Header } from "../../../app/shell/Header";
import { useToast } from "../../../app/shell/ToastProvider";
import { ProductTemplate } from "../../../app/templates/ProductTemplate";
import { HttpError } from "../../../shared/http-error";
import { formatMinor } from "../../../shared/money";
import { AddToCart } from "../../../ui/AddToCart";
import { Button } from "../../../ui/Button";
import { Chip } from "../../../ui/Chip";
import { Gallery } from "../../../ui/Gallery";
import { IconButton } from "../../../ui/IconButton";
import { Price } from "../../../ui/Price";
import { ProductTile } from "../../../ui/ProductTile";
import { useCart } from "../../cart";
import { storefrontProducts } from "../model";
import { selectOffer } from "../offer";
import { useProduct } from "../product-api";
import { toTiles } from "./toTiles";
import { VariantsSheet } from "./VariantsSheet";

export function ProductScreen() {
  const { id } = useParams({ strict: false }) as { id: string };
  const query = useProduct(id);
  const cart = useCart();
  const navigate = useNavigate();
  const toast = useToast();
  const { variant: preferred } = useSearch({ from: "/p/$id" });
  const [selected, setSelected] = useState<string>();
  const [variantSheet, setVariantSheet] = useState<string>();
  const data = query.data;
  const offer = data ? selectOffer(data.variants, cart.query.data?.lines ?? [], id) : undefined;
  const variant = data?.variants.find((item) => item.id === (selected ?? preferred)) ?? offer?.variant;
  const value = cart.query.data?.lines.find((line) => line.variantId === variant?.id)?.quantity ?? 0;
  const name = data?.name ?? "Товар";
  const unavailable = query.error instanceof HttpError && query.error.status === 404;
  const title = data ? "Korzina" : name;
  const details = data?.description.trim();
  const share = async () => {
    const url = new URL(`/p/${encodeURIComponent(id)}`, window.location.origin);
    const shop = new URLSearchParams(window.location.search).get("shop");
    if (shop) url.searchParams.set("shop", shop);
    const telegram = window.Telegram?.WebApp as { openTelegramLink?: (url: string) => void } | undefined;
    if (telegram?.openTelegramLink) {
      const shareUrl = new URL("https://t.me/share/url");
      shareUrl.searchParams.set("url", url.href);
      telegram.openTelegramLink(shareUrl.href);
      return;
    }
    try {
      if (navigator.share) await navigator.share({ title: name, url: url.href });
      else {
        await navigator.clipboard.writeText(url.href);
        toast("Ссылка скопирована");
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) toast("Не удалось поделиться ссылкой");
    }
  };
  const related = data
    ? toTiles({
        products: storefrontProducts(data.recommendations.items, data.recommendations.offers),
        currency: data.currency,
        cart,
        choose: setVariantSheet,
      })
    : [];
  const change = (quantity: number) => {
    if (!variant || !data) return;
    cart.change(
      {
        variantId: variant.id,
        productId: id,
        name,
        unit: variant.name,
        quantity: value,
        priceMinor: variant.priceMinor,
        stock: variant.stock,
        available: variant.available,
      },
      quantity,
      data.currency,
    );
  };
  return (
    <>
      <ProductTemplate
        title={title}
        header={
          <Header
            title={title}
            actions={
              data && (
                <IconButton aria-label="Поделиться" onClick={() => void share()}>
                  <Share2 size={22} />
                </IconButton>
              )
            }
          />
        }
        state={{
          query: unavailable ? { ...query, isError: false } : query,
          empty: unavailable,
          emptyTitle: "Товар больше недоступен",
          emptyDescription: "",
          onEmpty: () => void navigate({ to: "/" }),
        }}
        gallery={
          <Gallery images={data?.images.map((image) => ({ ...image, src: image.src ?? "" })) ?? []} name={name} />
        }
        info={
          <div className="space-y-3">
            <h1 className="text-title-1">{data?.name}</h1>
            {data?.brandId && data.brandName && (
              <Link to="/b/$id" params={{ id: data.brandId }} className="text-primary-text">
                {data.brandName} ›
              </Link>
            )}
            {data && variant && (
              <>
                <Price
                  currency={data.currency}
                  amountMinor={variant.priceMinor}
                  oldMinor={variant.oldPriceMinor ?? undefined}
                  size="display"
                />
                {data.variants.length > 1 && (
                  <fieldset aria-label="Фасовка" className="flex gap-2 overflow-x-auto">
                    {data.variants.map((item) => (
                      <Chip
                        key={item.id}
                        selected={item.id === variant.id}
                        className="whitespace-nowrap"
                        onClick={(event) => {
                          setSelected(item.id);
                          event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
                        }}
                      >
                        {item.name}
                      </Chip>
                    ))}
                  </fieldset>
                )}
                {variant.available && variant.stock !== null && variant.stock > 0 && variant.stock <= 5 && (
                  <p className="text-small text-muted-foreground">Всего доступно {variant.stock} шт.</p>
                )}
              </>
            )}
            {details && (
              <>
                <p className="line-clamp-3 whitespace-pre-line text-body text-foreground-body">{details}</p>
                <Link to="/p/$id/details" params={{ id }} className="text-primary-text">
                  Подробнее о товаре ›
                </Link>
              </>
            )}
          </div>
        }
        buyBar={
          data &&
          variant &&
          (variant.available || value > 0 ? (
            value ? (
              <AddToCart
                size="lg"
                value={value}
                max={variant.stock ?? 999}
                onChange={change}
                disabled={cart.pendingProducts.has(id) || !cart.query.data}
              />
            ) : (
              <Button
                size="lg"
                full
                aria-label="Добавить в корзину"
                onClick={() => change(1)}
                disabled={!cart.query.data}
                loading={cart.pendingProducts.has(id)}
              >
                Добавить · {formatMinor(variant.priceMinor, data.currency)}
              </Button>
            )
          ) : (
            <Button full size="lg" variant="secondary" disabled>
              Нет в наличии
            </Button>
          ))
        }
        related={
          related.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-title-2">Ещё из категории</h2>
              <div className="grid grid-cols-2 gap-2">
                {related.map(({ id: productId, ...tile }) => (
                  <ProductTile key={productId} {...tile} />
                ))}
              </div>
            </section>
          )
        }
      />
      {variantSheet && <VariantsSheet id={variantSheet} onClose={() => setVariantSheet(undefined)} />}
      <Outlet />
    </>
  );
}
