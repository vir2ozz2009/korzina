import { Link as RouteLink, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { CatalogTemplate } from "../../../app/templates/CatalogTemplate";
import { CheckoutTemplate } from "../../../app/templates/CheckoutTemplate";
import { FeedbackTemplate } from "../../../app/templates/FeedbackTemplate";
import { FormTemplate } from "../../../app/templates/FormTemplate";
import { HomeTemplate } from "../../../app/templates/HomeTemplate";
import { ListTemplate } from "../../../app/templates/ListTemplate";
import { OrderTemplate } from "../../../app/templates/OrderTemplate";
import { ProductTemplate } from "../../../app/templates/ProductTemplate";
import type { TemplateName } from "../../../app/templates/types";
import { AddToCart } from "../../../ui/AddToCart";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { Gallery } from "../../../ui/Gallery";
import { Input } from "../../../ui/Input";
import { ListItem } from "../../../ui/ListItem";
import { OrderStatusCard } from "../../../ui/OrderStatusCard";
import { Price } from "../../../ui/Price";
import { StatusPill } from "../../../ui/StatusPill";
import { TotalsBlock } from "../../../ui/TotalsBlock";
import { useDemoState } from "../useDemoState";
import { DemoProducts, demoImage } from "./DemoProducts";
import { DemoUndo } from "./DemoUndo";

export function TemplateView({ template }: { template: TemplateName }) {
  const state = useDemoState(template);
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const [name, setName] = useState("Korzina");
  const [savedName, setSavedName] = useState("Korzina");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [quantity, setQuantity] = useState(0);
  const [saved, setSaved] = useState(false);
  const [count, setCount] = useState(8);
  const rows = Array.from({ length: count }, (_, i) => i + 1042).map((id) => (
    <ListItem
      key={id}
      title={`Заказ №${id}`}
      subtitle="Сегодня · доставка с 14:00"
      onClick={() => void navigate({ to: "/seller/orders/demo" })}
    />
  ));
  const title = `Шаблон · ${template}`;
  const summary = (
    <TotalsBlock
      rows={[
        { label: "Товары", amountMinor: 18900 },
        { label: "Доставка", amountMinor: 5000 },
      ]}
      totalMinor={23900}
    />
  );
  if (template === "home")
    return (
      <HomeTemplate
        state={state}
        title={title}
        sections={[
          <>
            <Card>
              <h1 className="text-title-1">Свежие продукты</h1>
              <p>Доставим к вашему столу</p>
            </Card>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <DemoProducts />
            </div>
          </>,
        ]}
        onRefresh={() => void state.query.refetch()}
        refreshing={state.query.isFetching}
      />
    );
  if (template === "catalog")
    return (
      <CatalogTemplate
        state={state}
        title={title}
        layout="list"
        toolbar={<Input label="Поиск по каталогу" placeholder="Название товара" />}
      >
        {
          <div className="grid grid-cols-2 gap-2">
            <DemoProducts />
          </div>
        }
      </CatalogTemplate>
    );
  if (template === "product")
    return (
      <ProductTemplate
        state={state}
        title={title}
        gallery={<Gallery images={[demoImage]} name="Томаты на ветке" />}
        info={
          <Card>
            <h1 className="text-title-1">Томаты на ветке</h1>
            <Price amountMinor={18900} />
            <RouteLink to="/p/demo/details" className="block py-3 text-primary-text">
              Подробнее
            </RouteLink>
          </Card>
        }
        buyBar={<AddToCart value={quantity} max={10} onChange={setQuantity} size="lg" />}
      />
    );
  if (template === "checkout")
    return (
      <CheckoutTemplate
        state={state}
        title={title}
        sections={[
          <Card key="products">
            <ListItem title="Томаты на ветке" subtitle="500 г · 1 шт." value="189 ₽" />
          </Card>,
        ]}
        summary={summary}
        cta="Продолжить · 239 ₽"
        submitting={submitting}
        onSubmit={() => {
          setSubmitting(true);
          setTimeout(() => {
            setSubmitting(false);
            void navigate({ to: "/dev/templates/feedback", replace: true });
          }, 600);
        }}
      />
    );
  if (template === "order")
    return (
      <OrderTemplate
        state={state}
        title={title}
        status={
          <OrderStatusCard
            number="1042"
            time="14:00 – 16:00"
            stage="Собираем заказ"
            payment={<StatusPill tone="success">Оплачен</StatusPill>}
          />
        }
        sections={[<Card key="summary">{summary}</Card>]}
        events={
          <>
            <li>12:15 · Заказ создан</li>
            <li>12:20 · Принят магазином</li>
          </>
        }
      />
    );
  if (template === "form")
    return (
      <FormTemplate
        state={state}
        title={title}
        dirty={name !== savedName}
        submit={saved && name === savedName ? "Сохранено" : "Сохранить"}
        submitting={submitting}
        error={error}
        groups={[
          <Card key="details">
            <Input
              label="Название магазина"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setSaved(false);
              }}
            />
          </Card>,
        ]}
        onSubmit={() => {
          const result = z.string().trim().min(2).safeParse(name);
          if (!result.success) {
            setError("Введите название длиной от 2 символов");
            return;
          }
          setError("");
          setSubmitting(true);
          setTimeout(() => {
            setSavedName(name);
            setSubmitting(false);
            setSaved(true);
          }, 600);
        }}
      />
    );
  if (template === "list")
    return (
      <ListTemplate
        state={state}
        title={title}
        filters={
          <Input
            label="Фильтр заказов"
            value={search.filter ?? ""}
            onChange={(event) =>
              void navigate({
                to: "/dev/templates/list",
                search: (previous) => ({ ...previous, filter: event.target.value }),
                replace: true,
                resetScroll: false,
              })
            }
          />
        }
        onLoadMore={() => setCount((value) => value + 8)}
      >
        {rows}
      </ListTemplate>
    );
  return (
    <FeedbackTemplate
      state={state}
      title={title}
      body={
        <div className="space-y-3">
          <Card>
            <h1 className="text-title-1">Всё готово</h1>
            <p>Изменения сохранены. Можно продолжать работу.</p>
          </Card>
          <DemoUndo />
        </div>
      }
      actions={
        <Button full onClick={() => void navigate({ to: "/", replace: true })}>
          На главную
        </Button>
      }
    />
  );
}
