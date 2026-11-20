import type { SellerGroup, SellerProduct, SellerProductInput } from "../../../../shared/contracts/seller-catalog";
import { Card } from "../../../../ui/Card";
import { Input } from "../../../../ui/Input";
import { ListItem } from "../../../../ui/ListItem";
import { Radio } from "../../../../ui/Radio";
import { catalogStatus } from "./CatalogProducts";

export function initialProductText(product?: SellerProduct, category?: string, brand?: string) {
  return {
    name: product?.name ?? "",
    description: product?.description ?? "",
    ingredients: product?.ingredients ?? "",
    storageNotes: product?.storageNotes ?? "",
    categoryId: product ? product.categoryId : (category ?? null),
    brandId: product ? product.brandId : (brand ?? null),
    status: product?.status ?? ("selling" as const),
    recommendations: product?.recommendations ?? ("auto" as const),
    recommendationIds: product?.recommendationIds ?? [],
  };
}

export function ProductTextFields({
  draft,
  update,
  category,
  brand,
  onCategory,
  onBrand,
  disabled,
  error,
}: {
  draft: ReturnType<typeof initialProductText>;
  update: (patch: Partial<ReturnType<typeof initialProductText>>) => void;
  category?: SellerGroup;
  brand?: SellerGroup;
  onCategory: () => void;
  onBrand: () => void;
  disabled: boolean;
  error?: string;
}) {
  return (
    <Card className="space-y-3">
      <Input
        label="Название"
        value={draft.name}
        maxLength={150}
        disabled={disabled}
        error={error}
        onChange={(event) => update({ name: event.target.value })}
      />
      {(
        [
          ["description", "Описание", 2500],
          ["ingredients", "Состав", 1200],
          ["storageNotes", "Хранение", 1200],
        ] as const
      ).map(([field, label, length]) => (
        <label className="block space-y-1 text-label" key={field}>
          {label}
          <textarea
            value={draft[field]}
            maxLength={length}
            disabled={disabled}
            className="block w-full min-h-20 rounded-lg bg-input px-3 py-2 text-body disabled:opacity-40"
            onChange={(event) => update({ [field]: event.target.value })}
          />
        </label>
      ))}
      <ListItem
        title="Категория"
        value={category?.name ?? "Без категории"}
        onClick={disabled ? undefined : onCategory}
      />
      <ListItem title="Бренд" value={brand?.name ?? "Без бренда"} onClick={disabled ? undefined : onBrand} />
    </Card>
  );
}

export function ProductStatusFields({
  draft,
  disabled,
  changeStatus,
  onRecommendations,
  update,
}: {
  draft: ReturnType<typeof initialProductText>;
  disabled: boolean;
  changeStatus: (status: SellerProductInput["status"]) => void;
  onRecommendations: () => void;
  update: (patch: Partial<ReturnType<typeof initialProductText>>) => void;
}) {
  return (
    <Card className="space-y-3">
      <fieldset>
        <legend className="text-label">Статус товара</legend>
        {(Object.keys(catalogStatus) as SellerProductInput["status"][]).map((status) => (
          <Radio
            key={status}
            name="product-status"
            label={catalogStatus[status]}
            checked={draft.status === status}
            disabled={disabled}
            onChange={() => changeStatus(status)}
          />
        ))}
      </fieldset>
      <fieldset>
        <legend className="text-label">Рекомендации</legend>
        {(
          [
            ["auto", "Автоматически"],
            ["manual", "Выбрать вручную"],
            ["off", "Выключены"],
          ] as const
        ).map(([value, label]) => (
          <Radio
            key={value}
            name="recommendations"
            label={label}
            checked={draft.recommendations === value}
            disabled={disabled}
            onChange={() => update({ recommendations: value })}
          />
        ))}
      </fieldset>
      {draft.recommendations === "manual" && (
        <ListItem
          title="Подобрать товары"
          value={`${draft.recommendationIds.length} из 10`}
          onClick={disabled ? undefined : onRecommendations}
        />
      )}
    </Card>
  );
}
