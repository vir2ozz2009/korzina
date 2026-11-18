import { useState } from "react";
import type { CatalogFilters as Filters } from "../../../shared/contracts/catalog-list";
import { formatMinor } from "../../../shared/money";
import { Button } from "../../../ui/Button";
import { Chip } from "../../../ui/Chip";
import { Input } from "../../../ui/Input";
import { Sheet } from "../../../ui/Sheet";

const sortOptions = [
  ["default", "По умолчанию"],
  ["price-asc", "Сначала дешевле"],
  ["price-desc", "Сначала дороже"],
  ["name", "По названию"],
] as const;
type Choice = { id: string; name: string };
const plural = new Intl.PluralRules("ru");
const forms = { zero: "товаров", one: "товар", two: "товара", few: "товара", many: "товаров", other: "товаров" };
function countLabel(n: number) {
  return `${n} ${forms[plural.select(n)]}`;
}
export function CatalogFilters({
  filters,
  defaultSortLabel = "По умолчанию",
  categories,
  brands,
  currency,
  count,
  previewCount,
  pending,
  onDraft,
  onApply,
  onCharacteristics,
}: {
  filters: Filters;
  defaultSortLabel?: string;
  categories: Choice[];
  brands: Choice[];
  currency: string;
  count: number | null;
  previewCount: number | null;
  pending: boolean;
  onDraft: (filters: Filters | undefined) => void;
  onApply: (filters: Filters) => void;
  onCharacteristics?: () => void;
}) {
  const [sheet, setSheet] = useState<"filters" | "sort">();
  const [level, setLevel] = useState<"category" | "brand">();
  const [draft, setDraft] = useState(filters);
  const selected = (value?: string) => value?.split(",").filter(Boolean) ?? [];
  const update = (value: Filters) => {
    setDraft(value);
    onDraft(value);
  };
  const close = () => {
    setSheet(undefined);
    setLevel(undefined);
    onDraft(undefined);
  };
  const open = () => {
    setSheet("filters");
    setLevel(undefined);
    update(filters);
  };
  const digits =
    new Intl.NumberFormat("ru", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 0;
  const scale = 10 ** digits;
  const amount = (value: string) => (value ? Math.round(Number(value) * scale) : undefined);
  const rangeValid = draft.min === undefined || draft.max === undefined || draft.min <= draft.max;
  const category = categories.find((c) => c.id === filters.cat);
  const activeBrands = brands.filter((b) => selected(filters.brands).includes(b.id));
  const hasPrice = filters.min !== undefined || filters.max !== undefined;
  const hasFilters = hasPrice || !!category || activeBrands.length > 0 || Boolean(filters.inStock);
  const sort = sortOptions.find(([value]) => value === filters.sort)?.[1] ?? defaultSortLabel;
  return (
    <>
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={open}>
            Фильтры
          </Button>
          <Button variant="secondary" onClick={() => setSheet("sort")}>
            {sort}
          </Button>
        </div>
        {hasFilters && (
          <div className="flex items-center gap-2 overflow-x-auto py-2">
            {hasPrice && (
              <Chip onClick={() => onApply({ ...filters, min: undefined, max: undefined })}>
                {filters.min === undefined ? "" : `От ${formatMinor(filters.min, currency)} `}
                {filters.max === undefined ? "" : `До ${formatMinor(filters.max, currency)} `}×
              </Chip>
            )}
            {category && <Chip onClick={() => onApply({ ...filters, cat: undefined })}>{category.name} ×</Chip>}
            {activeBrands.map((b) => (
              <Chip
                key={b.id}
                onClick={() =>
                  onApply({
                    ...filters,
                    brands:
                      selected(filters.brands)
                        .filter((id) => id !== b.id)
                        .join(",") || undefined,
                  })
                }
              >
                {b.name} ×
              </Chip>
            ))}
            {filters.inStock && <Chip onClick={() => onApply({ ...filters, inStock: undefined })}>В наличии ×</Chip>}
            <Button variant="ghost" onClick={() => onApply({ sort: filters.sort })}>
              Сбросить
            </Button>
          </div>
        )}
        {count !== null && <p className="text-muted-foreground">{countLabel(count)}</p>}
      </div>
      <Sheet
        open={Boolean(sheet)}
        title={
          sheet === "sort" ? "Сортировка" : level === "category" ? "Категория" : level === "brand" ? "Бренд" : "Фильтры"
        }
        onOpenChange={(visible) => {
          if (!visible) close();
        }}
      >
        {sheet === "sort" ? (
          <fieldset className="space-y-2" aria-label="Сортировка">
            {sortOptions.map(([value, label]) => (
              <label key={value} className="flex min-h-11 items-center justify-between">
                {value === "default" ? defaultSortLabel : label}
                <input
                  type="radio"
                  name="sort"
                  checked={(filters.sort ?? "default") === value}
                  onChange={() => {
                    onApply({ ...filters, sort: value === "default" ? undefined : value });
                    close();
                  }}
                />
              </label>
            ))}
          </fieldset>
        ) : level === "category" ? (
          <fieldset className="space-y-2" aria-label="Категория">
            {[{ id: "", name: "Все категории" }, ...categories].map((c) => (
              <label key={c.id} className="flex min-h-11 items-center justify-between">
                {c.name}
                <input
                  type="radio"
                  name="category"
                  checked={(draft.cat ?? "") === c.id}
                  onChange={() => {
                    update({ ...draft, cat: c.id || undefined });
                    setLevel(undefined);
                  }}
                />
              </label>
            ))}
            <Button full variant="secondary" onClick={() => setLevel(undefined)}>
              Назад
            </Button>
          </fieldset>
        ) : level === "brand" ? (
          <fieldset className="space-y-2" aria-label="Бренды">
            {brands.map((b) => (
              <label key={b.id} className="flex min-h-11 items-center justify-between">
                {b.name}
                <input
                  type="checkbox"
                  checked={selected(draft.brands).includes(b.id)}
                  onChange={({ target }) => {
                    const values = selected(draft.brands).filter((id) => id !== b.id);
                    if (target.checked) values.push(b.id);
                    update({ ...draft, brands: values.sort().join(",") || undefined });
                  }}
                />
              </label>
            ))}
            <Button full onClick={() => setLevel(undefined)}>
              Готово
            </Button>
          </fieldset>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Цена от"
                type="number"
                min="0"
                step={1 / scale}
                value={draft.min === undefined ? "" : draft.min / scale}
                onChange={(e) => update({ ...draft, min: amount(e.target.value) })}
              />
              <Input
                label="Цена до"
                type="number"
                min="0"
                step={1 / scale}
                value={draft.max === undefined ? "" : draft.max / scale}
                onChange={(e) => update({ ...draft, max: amount(e.target.value) })}
                error={rangeValid ? undefined : "Укажите цену больше или равную нижней границе"}
              />
            </div>
            <p className="text-label">Категория</p>
            <Button full variant="secondary" onClick={() => setLevel("category")}>
              {categories.find((c) => c.id === draft.cat)?.name ?? "Все категории"} ›
            </Button>
            <p className="text-label">Бренд</p>
            <Button full variant="secondary" onClick={() => setLevel("brand")}>
              {selected(draft.brands).length ? `Выбрано: ${selected(draft.brands).length}` : "Все бренды"} ›
            </Button>
            {onCharacteristics && (
              <>
                <p className="text-label">Характеристики</p>
                <Button full variant="secondary" onClick={onCharacteristics}>
                  Любые характеристики ›
                </Button>
              </>
            )}
            <label className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                checked={!!draft.inStock}
                onChange={({ target }) => update({ ...draft, inStock: target.checked ? "1" : undefined })}
              />{" "}
              Только в наличии
            </label>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => update({ sort: draft.sort })}>
                Сбросить
              </Button>
              <Button
                className="grow"
                disabled={!rangeValid}
                loading={pending}
                onClick={() => {
                  onApply(draft);
                  close();
                }}
              >
                {previewCount === null ? "Показать товары" : `Показать ${countLabel(previewCount)}`}
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}
