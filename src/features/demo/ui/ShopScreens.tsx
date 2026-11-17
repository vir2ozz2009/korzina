import { Link as RouteLink, useNavigate } from "@tanstack/react-router";
import { bootstrap } from "../../../app/bootstrap";
import { HomeTemplate } from "../../../app/templates/HomeTemplate";
import { Card } from "../../../ui/Card";
import { SectionHeader } from "../../../ui/SectionHeader";
import { StoreHeader } from "../../../ui/StoreHeader";
import { useDemoState } from "../useDemoState";
import { DemoProducts } from "./DemoProducts";

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
