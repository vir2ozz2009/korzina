import { Plus } from "lucide-react";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { ListItem } from "../../../../ui/ListItem";
import type { useProductEditor } from "./useProductEditor";
import { VariantFields, variantDraft } from "./VariantFields";

type Editor = ReturnType<typeof useProductEditor>;

export function ProductVariantEditor({
  editor,
  canWrite,
  editing,
}: {
  editor: Editor;
  canWrite: boolean;
  editing: NonNullable<Editor["editing"]>;
}) {
  const { variants, setVariants, setEditing, disabled, patchVariant } = editor;
  return (
    <Card className="space-y-3">
      <h2 className="text-title-3">{editing.value.id ? "Редактировать фасовку" : "Новая фасовка"}</h2>
      <VariantFields
        row={editing.value}
        multiple
        disabled={disabled}
        sale
        error={editing.nameError}
        patch={(patch) =>
          setEditing({
            ...editing,
            value: { ...editing.value, ...patch },
            nameError: patch.name === undefined ? editing.nameError : undefined,
          })
        }
      />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => setEditing(undefined)}>
          Назад
        </Button>
        <Button
          disabled={disabled}
          onClick={() => {
            if (editing.index < variants.length) patchVariant(editing.index, editing.value);
            else setVariants([...variants, editing.value]);
            setEditing(undefined);
          }}
        >
          Готово
        </Button>
      </div>
      {canWrite && variants.length > 1 && editing.index < variants.length && (
        <Button
          variant="ghost"
          onClick={() => {
            setVariants(variants.filter((_, index) => index !== editing.index));
            setEditing(undefined);
          }}
        >
          Удалить фасовку
        </Button>
      )}
    </Card>
  );
}

export function ProductVariants({
  editor,
  canWrite,
  currency,
}: {
  editor: Editor;
  canWrite: boolean;
  currency: string;
}) {
  const { variants, setEditing, disabled, patchVariant } = editor;
  return (
    <Card className="space-y-3">
      {variants.length === 1 ? (
        <VariantFields
          row={variants[0]}
          patch={(patch) => patchVariant(0, patch)}
          multiple={false}
          disabled={disabled}
        />
      ) : (
        <>
          <h2 className="text-title-3">Фасовки</h2>
          {variants.map((row, index) => (
            <ListItem
              key={row.key}
              title={row.name || "Название фасовки"}
              value={row.price}
              subtitle={
                !row.visible
                  ? "Фасовка скрыта"
                  : row.unlimited
                    ? "Без лимита"
                    : row.stock
                      ? `${row.stock} шт.`
                      : undefined
              }
              onClick={() => setEditing({ index, value: row })}
            />
          ))}
        </>
      )}
      {canWrite && (
        <Button
          variant="secondary"
          icon={<Plus size={16} />}
          disabled={disabled || variants.length >= 20}
          onClick={() => setEditing({ index: variants.length, value: variantDraft(currency) })}
        >
          Фасовка
        </Button>
      )}
    </Card>
  );
}
