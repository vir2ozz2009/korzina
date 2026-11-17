import { Outlet, Link as RouteLink } from "@tanstack/react-router";
import { useState } from "react";
import { ProductTemplate } from "../../../app/templates/ProductTemplate";
import { AddToCart } from "../../../ui/AddToCart";
import { Card } from "../../../ui/Card";
import { Gallery } from "../../../ui/Gallery";
import { Price } from "../../../ui/Price";
import { SectionHeader } from "../../../ui/SectionHeader";
import { useDemoState } from "../useDemoState";
import { DemoProducts, demoImage } from "./DemoProducts";

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
