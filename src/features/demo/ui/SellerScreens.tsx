import { Link as RouteLink, useRouterState } from "@tanstack/react-router";
import { HomeTemplate } from "../../../app/templates/HomeTemplate";
import { ListTemplate } from "../../../app/templates/ListTemplate";
import { OrderTemplate } from "../../../app/templates/OrderTemplate";
import { Card } from "../../../ui/Card";
import { ListItem } from "../../../ui/ListItem";
import { StatusPill } from "../../../ui/StatusPill";

export function SellerScreen() {
  const title = useRouterState({ select: (state) => state.matches.at(-1)?.staticData.title ?? "Главная" });
  if (title === "Главная")
    return (
      <HomeTemplate
        title="Главная"
        sections={[
          <Card key="intro">
            <h1 className="text-title-1">Рабочий день</h1>
            <p>Демо кабинета · сегодня 12 заказов</p>
            <RouteLink to="/seller/orders/demo" className="text-primary-text">
              Открыть заказ №1042 →
            </RouteLink>
            <RouteLink to="/" className="block text-primary-text">
              Витрина →
            </RouteLink>
          </Card>,
        ]}
      />
    );
  return (
    <ListTemplate title={title}>
      {Array.from({ length: 18 }, (_, i) => i + 1).map((id) => (
        <RouteLink key={id} to="/seller/orders/demo" className="block">
          <ListItem title={`${title} · ${id}`} subtitle="Демо-данные" />
        </RouteLink>
      ))}
    </ListTemplate>
  );
}
export function SellerOrder() {
  return (
    <OrderTemplate
      title="Заказ №1042"
      status={
        <Card>
          <StatusPill tone="warning">Собираем</StatusPill>
          <h1 className="text-title-1">Заказ №1042</h1>
        </Card>
      }
      sections={[
        <Card key="products">
          <ListItem title="Томаты на ветке" subtitle="500 г · 189 ₽" />
        </Card>,
      ]}
    />
  );
}
