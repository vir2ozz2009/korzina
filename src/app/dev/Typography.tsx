import { KitSection } from "../../ui/KitSection";

const samples = [
  ["text-display", "28 / 36 · Bold", "Свежие продукты"],
  ["text-title-1", "24 / 32 · Bold", "Корзина"],
  ["text-title-2", "22 / 29 · Bold", "Ваш заказ"],
  ["text-price", "20 / 26 · Bold", "1 250 ₽"],
  ["text-title-3", "18 / 23 · Semibold", "Доставка к вашему столу"],
  ["text-body-lg", "16 / 22 · Semibold", "Собрано с заботой"],
  ["text-body", "15 / 20 · Regular", "Овощи, фрукты и всё для вкусного дня."],
  ["text-label", "14 / 19 · Semibold", "Добавить в корзину"],
  ["text-meta", "14 / 18 · Regular", "Фасовка: 500 г"],
  ["text-caption", "13 / 17 · Medium", "Все товары"],
  ["text-small", "12 / 16 · Regular", "Цена за упаковку"],
  ["text-micro", "11 / 15 · Semibold", "ДОСТАВИМ СЮДА"],
];

export function Typography() {
  return (
    <KitSection title="Типографика">
      <p className="text-small text-muted-foreground">Inter Variable · Кириллица и латиница</p>
      <div className="divide-y divide-border">
        {samples.map(([className, details, copy]) => (
          <div key={className} className="space-y-1 py-3">
            <p className="text-micro text-muted-foreground">
              {className} · {details}
            </p>
            <p className={className}>{copy}</p>
          </div>
        ))}
      </div>
    </KitSection>
  );
}
