import { MessageCircle, Truck } from "lucide-react";
import { Avatar } from "../../ui/Avatar";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { CopyField } from "../../ui/CopyField";
import { Divider } from "../../ui/Divider";
import { Header } from "../../ui/Header";
import { IconButton } from "../../ui/IconButton";
import { KitSection } from "../../ui/KitSection";
import { ListItem } from "../../ui/ListItem";
import { OrderStatusCard } from "../../ui/OrderStatusCard";
import { SectionHeader } from "../../ui/SectionHeader";
import { StatusPill } from "../../ui/StatusPill";
import { StickyFooter } from "../../ui/StickyFooter";
import { StoreHeader } from "../../ui/StoreHeader";
import { StoreLogo } from "../../ui/StoreLogo";
import { TotalsBlock } from "../../ui/TotalsBlock";
import { demoTotals } from "./kit-mock";
export function DataKit({ notify }: { notify: (message: string) => void }) {
  return (
    <div className="space-y-3">
      <SectionHeader title="Структура" href="#kit-bottom" />
      <Card>
        <h3 className="text-title-3">Карточка · 16</h3>
        <p className="text-meta text-muted-foreground">Одна поверхность для связанных данных.</p>
        <Divider />
        <p className="text-small text-muted-foreground">Разделитель</p>
      </Card>
      <Card size="lg">
        <h3 className="text-title-2">Карточка · 20</h3>
        <TotalsBlock rows={demoTotals} totalMinor={23900} />
      </Card>
      <ListItem
        title="Доставка"
        subtitle="Завтра, 10:00–12:00"
        icon={<Truck size={24} />}
        onClick={() => notify("Условия доставки открыты")}
      />
      <ListItem title="Заказ №10482" value="239 ₽" variant="compact" href="#kit-bottom" />
      <KitSection title="Статусы">
        <div className="flex flex-wrap gap-2">
          {(["neutral", "warning", "danger", "success", "primary"] as const).map((tone, index) => (
            <StatusPill key={tone} tone={tone}>
              {["Черновик", "Ожидает", "Отменён", "Готово", "В сборке"][index]}
            </StatusPill>
          ))}
        </div>
      </KitSection>
      <OrderStatusCard
        number="№10482 · 17 ноября"
        time="10:00–12:00"
        stage="Собираем заказ"
        payment={<StatusPill tone="success">Оплачен</StatusPill>}
      />
      <KitSection title="Копирование и знаки">
        <CopyField
          label="Номер заказа"
          value="10482"
          onCopied={() => notify("Номер заказа скопирован")}
          onError={() => notify("Не удалось скопировать. Выделите номер вручную.")}
        />
        <div className="flex items-center gap-4">
          <Avatar name="Анна" />
          <Avatar name="Korzina" src="/brand/korzina.svg" />
          <StoreLogo name="Ферма" />
          <StoreLogo name="Korzina" src="/brand/korzina.svg" />
        </div>
      </KitSection>
      <section aria-label="Шапки" className="space-y-3 overflow-hidden rounded-xl">
        <Header
          title="Заказ №10482"
          onBack={() => notify("Назад")}
          actions={
            <IconButton aria-label="Чат по заказу" onClick={() => notify("Чат открыт")}>
              <MessageCircle size={22} />
            </IconButton>
          }
        />
        <Header
          title="В Telegram"
          telegram
          onBack={() => notify("BackButton подключается в F8")}
          background="background"
          actions={
            <Button variant="secondary" onClick={() => notify("Меню открыто")}>
              Ещё
            </Button>
          }
        />
        <StoreHeader
          name="Korzina"
          address="Лесная, 7"
          logo="/brand/korzina.svg"
          onAddress={() => notify("Выбор адреса")}
          onChat={() => notify("Чат открыт")}
          onProfile={() => notify("Профиль открыт")}
        />
      </section>
      <div className="relative h-64 overflow-auto rounded-xl border border-border">
        <div className="space-y-4 p-5">
          <p className="text-title-3">Закреплённый низ</p>
          <p className="min-h-56 text-meta text-muted-foreground">Прокрутите этот блок — кнопка остаётся внизу.</p>
        </div>
        <StickyFooter>
          <Button full onClick={() => notify("Продолжаем")}>
            Продолжить
          </Button>
        </StickyFooter>
      </div>
      <div id="kit-bottom" />
    </div>
  );
}
