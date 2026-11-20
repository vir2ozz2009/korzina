import { useState } from "react";
import type { SellerGroup, SellerGroupInput, SellerGroupKind } from "../../../../shared/contracts/seller-catalog";
import { Card } from "../../../../ui/Card";
import { Input } from "../../../../ui/Input";
import { Switch } from "../../../../ui/Switch";
import { CatalogPhotos, useCatalogPhotos } from "./CatalogPhotos";

export function useGroupDraft(store: string, group: SellerGroup | undefined, parentId: string | null) {
  const [name, setName] = useState(group?.name ?? "");
  const [visible, setVisible] = useState(group?.visible ?? true);
  const photos = useCatalogPhotos(store, group?.photo ? [group.photo] : [], 1);
  const data: SellerGroupInput = {
    name: name.trim(),
    visible,
    parentId,
    photo: photos.values[0] ?? null,
    expectedRevision: group?.revision,
  };
  const dirty = name !== (group?.name ?? "") || visible !== (group?.visible ?? true) || photos.dirty;
  return { name, setName, visible, setVisible, photos, data, dirty };
}
export function GroupFields({
  draft,
  kind,
  disabled,
  error,
}: {
  draft: ReturnType<typeof useGroupDraft>;
  kind: SellerGroupKind;
  disabled: boolean;
  error?: string;
}) {
  const category = kind === "categories";
  return (
    <>
      <Card className="space-y-3">
        <Input
          label="Название"
          value={draft.name}
          disabled={disabled}
          maxLength={120}
          error={error}
          onChange={(event) => draft.setName(event.target.value)}
        />
        <Switch
          label="Показывать на витрине"
          checked={draft.visible}
          disabled={disabled}
          onChange={(event) => draft.setVisible(event.target.checked)}
        />
      </Card>
      <Card className="space-y-3">
        <CatalogPhotos
          photos={draft.photos}
          disabled={disabled}
          single
          label={category ? "Фото категории" : "Логотип бренда"}
        />
        {!draft.photos.items.length && (
          <p className="text-meta text-muted-foreground">
            {category ? "Фото первого товара" : "Инициалы вместо логотипа"}
          </p>
        )}
      </Card>
    </>
  );
}
