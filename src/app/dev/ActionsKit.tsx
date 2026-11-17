import { Check, MessageCircle, Search, ShoppingBasket } from "lucide-react";
import { useState } from "react";
import { AddToCart } from "../../ui/AddToCart";
import { Button } from "../../ui/Button";
import { FloatingActions } from "../../ui/FloatingActions";
import { IconButton } from "../../ui/IconButton";
import { KitSection } from "../../ui/KitSection";
import { Stepper } from "../../ui/Stepper";
export function ActionsKit({
  notify,
  chooseVariant,
}: {
  notify: (message: string) => void;
  chooseVariant: () => void;
}) {
  const [quantity, setQuantity] = useState(0);
  const [small, setSmall] = useState(1);
  return (
    <div className="space-y-3">
      <KitSection title="Кнопки">
        <p className="text-meta text-muted-foreground">Четыре варианта · обычная, загрузка, недоступна</p>
        {(["primary", "secondary", "soft", "ghost"] as const).map((variant) => (
          <div key={variant} className="space-y-2">
            <p className="text-micro text-muted-foreground">{variant}</p>
            <div className="grid grid-cols-3 gap-2">
              <Button variant={variant} onClick={() => notify("Действие выполнено")}>
                Действие
              </Button>
              <Button variant={variant} loading>
                Действие
              </Button>
              <Button variant={variant} disabled>
                Действие
              </Button>
            </div>
          </div>
        ))}
        <Button size="lg" full icon={<Check size={22} />} onClick={() => notify("Сохранено")}>
          Сохранить · 48
        </Button>
        <Button size="xl" full subtitle="239 ₽ · 2 товара" onClick={() => notify("Это пример кнопки оформления")}>
          Продолжить · 60
        </Button>
      </KitSection>
      <KitSection title="Иконки">
        <div className="flex flex-wrap gap-3">
          <IconButton background="card" aria-label="Поиск" onClick={() => notify("Поиск открыт")}>
            <Search size={22} />
          </IconButton>
          <IconButton aria-label="Корзина" badge={3} onClick={() => notify("В корзине 3 товара")}>
            <ShoppingBasket size={22} />
          </IconButton>
          <IconButton aria-label="Чат" disabled>
            <MessageCircle size={22} />
          </IconButton>
          <IconButton aria-label="Загрузка" loading />
        </div>
      </KitSection>
      <KitSection title="Количество">
        <p className="text-meta text-muted-foreground">Добавьте товар. Остаток — 3 шт.</p>
        <AddToCart value={quantity} max={3} onChange={setQuantity} />
        {quantity === 3 && (
          <p role="status" className="text-small text-muted-foreground">
            Больше нет
          </p>
        )}
        <AddToCart value={1} max={3} onChange={setQuantity} size="lg" />
        <AddToCart value={0} max={3} onChange={setQuantity} onChooseVariant={chooseVariant} />
        <AddToCart value={1} max={3} onChange={setQuantity} loading />
        <AddToCart value={0} max={0} onChange={setQuantity} />
        <Stepper value={small} max={3} onChange={setSmall} />
        <Stepper value={1} max={3} onChange={setSmall} disabled />
      </KitSection>
      <KitSection title="Плавающие действия">
        <FloatingActions
          count={2}
          totalMinor={23900}
          onSearch={() => notify("Поиск открыт")}
          onCart={() => notify("Корзина открыта")}
        />
        <FloatingActions
          count={0}
          totalMinor={0}
          onSearch={() => notify("Поиск открыт")}
          onCart={() => notify("Корзина открыта")}
        />
      </KitSection>
    </div>
  );
}
