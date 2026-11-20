import { useState } from "react";
import type { SellerGroup, SellerGroupKind } from "../../../../shared/contracts/seller-catalog";
import { Button } from "../../../../ui/Button";
import { ListItem } from "../../../../ui/ListItem";
import { SearchField } from "../../../../ui/SearchField";
import { Sheet } from "../../../../ui/Sheet";
import { useCatalogCommand } from "../../catalog-api";
import { GroupFields, useGroupDraft } from "./GroupFields";

export function GroupPicker({
  store,
  kind,
  groups,
  onSelect,
  onClose,
}: {
  store: string;
  kind: SellerGroupKind;
  groups: SellerGroup[];
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [create, setCreate] = useState(false);
  const category = kind === "categories";
  return create ? (
    <CreateCategory store={store} onBack={() => setCreate(false)} onSelect={onSelect} onClose={onClose} />
  ) : (
    <Sheet
      open
      title={category ? "Выбрать категорию" : "Выбрать бренд"}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      form
    >
      <div className="space-y-2">
        <SearchField label={category ? "Поиск категории" : "Поиск бренда"} value={query} onChange={setQuery} />
        <ListItem title={category ? "Без категории" : "Без бренда"} onClick={() => onSelect(null)} />
        {groups
          .filter((group) => group.name.toLocaleLowerCase("ru").includes(query.trim().toLocaleLowerCase("ru")))
          .map((group) => (
            <ListItem key={group.id} title={group.name} onClick={() => onSelect(group.id)} />
          ))}
        {category && (
          <Button full onClick={() => setCreate(true)}>
            Создать категорию
          </Button>
        )}
      </div>
    </Sheet>
  );
}

function CreateCategory({
  store,
  onSelect,
  onClose,
  onBack,
}: {
  store: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onBack: () => void;
}) {
  const draft = useGroupDraft(store, undefined, null);
  const command = useCatalogCommand<{ group: SellerGroup }>(store);
  return (
    <Sheet
      open
      title="Создать категорию"
      onBack={onBack}
      onOpenChange={(open) => {
        if (!open && !command.isPending) onClose();
      }}
      form
    >
      <div className="space-y-3">
        <GroupFields draft={draft} kind="categories" disabled={command.isPending} />
        {command.error && <p role="alert">{command.error.message}</p>}
        <Button
          full
          loading={command.isPending}
          disabled={!draft.data.name || draft.photos.pending}
          onClick={() =>
            command.mutate(
              { path: "/groups/categories", input: draft.data },
              {
                onSuccess: ({ group }) => onSelect(group.id),
              },
            )
          }
        >
          Сохранить категорию
        </Button>
      </div>
    </Sheet>
  );
}
