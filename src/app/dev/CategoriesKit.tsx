import { useState } from "react";
import { Button } from "../../ui/Button";
import { CategoryRail } from "../../ui/CategoryRail";
import { type CategorySize, CategoryTile } from "../../ui/CategoryTile";
import { berryPhoto, croissantPhoto, milkPhoto, tomatoPhoto } from "./kit-mock";
export function CategoriesKit() {
  const [tall, setTall] = useState(false);
  const categories = [
    { name: "Выпечка", image: croissantPhoto },
    { name: "Фрукты и ягоды", image: berryPhoto },
    { name: "Овощи и зелень", image: tomatoPhoto },
    { name: "Молочные", image: milkPhoto },
    { name: "Без фото" },
  ];
  return (
    <section id="kit-product-categories" aria-label="Мозаика категорий" className="space-y-3">
      <h2 className="px-2 text-title-2">Категории</h2>
      <CategoryRail>
        {categories.map((category, index) => (
          <CategoryTile
            key={category.name}
            {...category}
            href="#product-example"
            size={
              tall
                ? (["2x2", "1x2", "1x1", "2x1"] as CategorySize[])[index % 4]
                : index % 4 === 0 || index % 4 === 3
                  ? "2x1"
                  : "1x1"
            }
            column={tall ? undefined : [1, 3, 1, 2][index % 4] + Math.floor(index / 4) * 3}
            row={tall ? undefined : [1, 1, 2, 2][index % 4]}
          />
        ))}
      </CategoryRail>
      <Button variant="secondary" onClick={() => setTall((value) => !value)}>
        Мозаика: {tall ? "1×1, 2×1" : "1×2, 2×2"}
      </Button>
    </section>
  );
}
