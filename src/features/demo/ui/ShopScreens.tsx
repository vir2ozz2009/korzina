import { Outlet, Link as RouteLink, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { bootstrap } from "../../../app/bootstrap";
import { HomeTemplate } from "../../../app/templates/HomeTemplate";
import { ProductTemplate } from "../../../app/templates/ProductTemplate";
import { AddToCart } from "../../../ui/AddToCart";
import { Card } from "../../../ui/Card";
import { Gallery } from "../../../ui/Gallery";
import { Price } from "../../../ui/Price";
import { SectionHeader } from "../../../ui/SectionHeader";
import { StoreHeader } from "../../../ui/StoreHeader";
import { useDemoState } from "../useDemoState";
import { DemoProducts, demoImage } from "./DemoProducts";

export function ShopHome() {
  const state = useDemoState("home");
  const navigate = useNavigate();
  return (
    <HomeTemplate
      state={state}
      title="Магазин"
      header={<StoreHeader name={bootstrap?.name ?? "Korzina"} />}
      sections={[
        <Card key="intro">
          <h1 className="text-title-1">Свежее к вашему столу</h1>
          <p className="text-meta text-muted-foreground">Демо каркаса · товары и действия пока на примерах</p>
          <RouteLink to="/dev/templates/home" className="text-primary-text">
            Все шаблоны →
          </RouteLink>
          <div className="flex gap-4">
            <RouteLink to="/seller" className="text-primary-text">
              Кабинет
            </RouteLink>
            <RouteLink to="/dev/kit" className="text-primary-text">
              UI-кит
            </RouteLink>
          </div>
        </Card>,
        <div key="products">
          <SectionHeader title="Рекомендуем" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <DemoProducts count={12} />
          </div>
        </div>,
      ]}
      onRefresh={() => void navigate({ to: "/", search: { simulate: "loading" } })}
    />
  );
}
export function DemoProduct() {
  const state = useDemoState("product");
  const [quantity, setQuantity] = useState(0);
  return (
    <>
      <ProductTemplate
        state={state}
        title="Томаты на ветке"
        gallery={<Gallery images={[demoImage]} name="Томаты на ветке" />}
        info={
          <div>
            <Card>
              <Price amountMinor={18900} size="display" />
              <h1 className="text-title-1">Томаты на ветке</h1>
              <p className="text-meta text-muted-foreground">500 г · свежие и ароматные</p>
              <RouteLink to="/p/demo/details" className="block py-3 text-primary-text">
                Подробнее о товаре
              </RouteLink>
            </Card>
          </div>
        }
        related={
          <>
            <SectionHeader title="С этим покупают" />
            <div className="grid grid-cols-2 gap-2">
              <DemoProducts count={2} />
            </div>
          </>
        }
        buyBar={<AddToCart value={quantity} max={10} onChange={setQuantity} size="lg" />}
      />
      <Outlet />
    </>
  );
}
