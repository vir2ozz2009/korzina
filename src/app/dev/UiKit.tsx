import { Palette, ShoppingBasket } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "../../ui/Button";
import { ChipGroup } from "../../ui/ChipGroup";
import { Sheet } from "../../ui/Sheet";
import { Toast } from "../../ui/Toast";
import { ActionsKit } from "./ActionsKit";
import { DataKit } from "./DataKit";
import { FeedbackKit } from "./FeedbackKit";
import { InputsKit } from "./InputsKit";
import { ProductsKit } from "./ProductsKit";
import ThemeKit from "./ThemeKit";

const sections = [
  { value: "actions", label: "Действия" },
  { value: "products", label: "Товары" },
  { value: "inputs", label: "Ввод" },
  { value: "data", label: "Структура" },
  { value: "feedback", label: "Состояния" },
  { value: "theme", label: "Тема" },
];
export function UiKit() {
  const [section, setSection] = useState("actions");
  const [toast, setToast] = useState("");
  const [variant, setVariant] = useState(false);
  const [toastVersion, setToastVersion] = useState(0);
  const closeToast = useCallback(() => setToast(""), []);
  function notify(message: string) {
    setToast(message);
    setToastVersion((value) => value + 1);
  }
  return (
    <div className="mx-auto max-w-(--content-max) px-(--page-x) pt-5 pb-8">
      <header className="mb-5 flex items-center justify-between gap-3 px-2">
        <a
          href={`/${location.search}`}
          className="flex min-h-11 items-center gap-2 text-title-3"
          aria-label="Korzina — главная"
        >
          <img src="/brand/korzina.svg" alt="" className="size-9" />
          Korzina
        </a>
        <span className="rounded-pill border border-border px-3 py-1 text-micro text-muted-foreground">
          UI KIT · 01
        </span>
      </header>
      <main>
        <div className="px-2">
          <p className="mb-2 text-micro text-primary-text">ЕДИНЫЙ ЯЗЫК МАГАЗИНА</p>
          <h1 className="text-display">
            Маленькие детали.
            <br />
            Цельный опыт.
          </h1>
          <p className="mt-3 mb-5 text-meta text-muted-foreground">
            Кнопки, товары и формы Korzina.
            <br />
            Всё можно потрогать.
          </p>
          <Button variant="secondary" size="md" icon={<Palette size={18} />} onClick={() => setSection("theme")}>
            Изменить цвет магазина
          </Button>
        </div>
        <nav aria-label="Разделы UI-кита" className="sticky top-0 z-30 -mx-3 my-4 bg-background/95 px-3 py-2">
          <ChipGroup label="Раздел UI-кита" options={sections} value={section} onChange={setSection} />
        </nav>
        {section === "actions" && <ActionsKit notify={notify} chooseVariant={() => setVariant(true)} />}
        {section === "products" && <ProductsKit notify={notify} />}
        {section === "inputs" && <InputsKit notify={notify} />}
        {section === "data" && <DataKit notify={notify} />}
        {section === "feedback" && <FeedbackKit notify={notify} />}
        {section === "theme" && <ThemeKit embedded />}
      </main>
      <footer className="mt-7 flex items-center gap-2 px-2 text-small text-muted-foreground">
        <ShoppingBasket size={16} />
        Korzina · Компоненты и состояния · F7
      </footer>
      <Sheet open={variant} onOpenChange={setVariant} title="Выберите фасовку" description="Пример товара с вариантами">
        <div className="space-y-2">
          <Button
            full
            variant="secondary"
            onClick={() => {
              setVariant(false);
              notify("Выбрано 500 г");
            }}
          >
            500 г · 189 ₽
          </Button>
          <Button
            full
            variant="secondary"
            onClick={() => {
              setVariant(false);
              notify("Выбран 1 кг");
            }}
          >
            1 кг · 378 ₽
          </Button>
        </div>
      </Sheet>
      {toast && (
        <Toast
          key={toastVersion}
          message={toast}
          onClose={closeToast}
          action={toast.includes("можно отменить") ? "Отменить" : undefined}
          onAction={() => notify("Действие отменено · пример")}
        />
      )}
    </div>
  );
}
