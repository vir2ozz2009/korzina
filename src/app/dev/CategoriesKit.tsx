import { Cherry, Croissant, Fish, Milk, Snowflake } from "lucide-react";
import { CategoryRail } from "../../ui/CategoryRail";
import { CategoryTile } from "../../ui/CategoryTile";
import { tomatoCutout } from "./kit-mock";
export function CategoriesKit() {
  return (
    <section id="kit-product-categories" aria-label="Мозаика категорий" className="space-y-3">
      <h2 className="px-2 text-title-2">Категории</h2>
      <CategoryRail>
        <CategoryTile name="Овощи и зелень" image={tomatoCutout} href="#product-example" wide />
        <CategoryTile name="Томаты" image={tomatoCutout} href="#product-example" />
        <CategoryTile name="Фрукты и ягоды" href="#product-example" icon={<Cherry size={40} />} />
        <CategoryTile name="Молочные продукты" href="#product-example" wide icon={<Milk size={40} />} />
        <CategoryTile name="Хлеб и выпечка" href="#product-example" icon={<Croissant size={40} />} />
        <CategoryTile name="Мясо и рыба" href="#product-example" icon={<Fish size={40} />} />
        <CategoryTile name="Полуфабрикаты" href="#product-example" icon={<Snowflake size={40} />} />
      </CategoryRail>
    </section>
  );
}
