import { useState } from "react";
import { useToast } from "../../../../app/shell/ToastProvider";
import type { SellerGroup, SellerGroupKind } from "../../../../shared/contracts/seller-catalog";
import { HttpError } from "../../../../shared/http-error";
import { Button } from "../../../../ui/Button";
import { ListItem } from "../../../../ui/ListItem";
import { Radio } from "../../../../ui/Radio";
import { Sheet } from "../../../../ui/Sheet";
import { useCatalogCommand } from "../../catalog-api";
import { CatalogEditorFrame, type CatalogFrame } from "./CatalogEditorFrame";
import { GroupFields, useGroupDraft } from "./GroupFields";
import { useCatalogNav } from "./navigation";

const targetsFor = (rows: SellerGroup[], id: string) => {
  const removed = new Set([id]);
  for (let i = 0; i < rows.length; i++) {
    const before = removed.size;
    for (const row of rows) if (row.parentId && removed.has(row.parentId)) removed.add(row.id);
    if (removed.size === before) break;
  }
  return rows.filter((row) => !removed.has(row.id));
};

export function GroupEditor({
  store,
  kind,
  canWrite,
  storefront,
  frame,
  initial,
  groups,
}: {
  store: string;
  kind: SellerGroupKind;
  canWrite: boolean;
  storefront: string;
  frame: CatalogFrame;
  initial?: SellerGroup;
  groups: SellerGroup[];
}) {
  const nav = useCatalogNav(store);
  const category = kind === "categories";
  const parentId = initial?.parentId ?? nav.params.get("parent");
  const draft = useGroupDraft(store, initial, parentId);
  const write = useCatalogCommand<{ group: SellerGroup }>(store);
  const remove = useCatalogCommand<{ transferred: number }>(store);
  const toast = useToast();
  const [nameError, setNameError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [needsTransfer, setNeedsTransfer] = useState(initial?.hasProducts ?? false);
  const [destination, setDestination] = useState<string | null>();
  const base = `/seller/${kind}`;
  const path = `/groups/${kind}${initial ? `/${encodeURIComponent(initial.id)}` : ""}`;
  const busy = write.isPending || remove.isPending;
  function save() {
    if (!draft.data.name) {
      setNameError("Введите название");
      return;
    }
    if (draft.photos.pending) {
      toast("Дождитесь загрузки фото");
      return;
    }
    setNameError("");
    write.mutate(
      { path, input: draft.data },
      {
        onSuccess: () => {
          toast("Сохранено");
          nav.leave(base, true);
        },
      },
    );
  }
  function deleteGroup() {
    if (!initial) return;
    remove.mutate(
      { path: `${path}/delete`, input: { revision: initial.revision, transferTo: destination } },
      {
        onSuccess: () => {
          toast(category ? "Категория удалена" : "Бренд удалён");
          nav.leave(base, true);
        },
        onError: (error) => {
          if (error instanceof HttpError && error.code === "NOT_EMPTY") setNeedsTransfer(true);
        },
      },
    );
  }

  return (
    <CatalogEditorFrame
      store={store}
      fallback={base}
      frame={frame}
      dirty={canWrite && draft.dirty}
      busy={busy}
      onSave={save}
    >
      <GroupFields draft={draft} kind={kind} disabled={!canWrite || busy} error={nameError} />
      {write.error && (
        <p role="alert" className="text-status-danger-foreground">
          {write.error.message}
        </p>
      )}
      {initial && (
        <>
          {category && <ListItem title="Подкатегории" onClick={() => nav.open(base, { parent: initial.id })} />}
          <ListItem
            title={category ? "Товары категории" : "Товары бренда"}
            onClick={() => nav.open("/seller/products", category ? { category: initial.id } : { brand: initial.id })}
          />
          {initial.onStorefront && draft.visible && (
            <Button
              full
              variant="secondary"
              onClick={() =>
                window.open(
                  new URL(`/${category ? "c" : "b"}/${encodeURIComponent(initial.id)}`, storefront),
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              Посмотреть на витрине
            </Button>
          )}
          {canWrite && (
            <Button full variant="ghost" className="text-status-danger-foreground" onClick={() => setDeleting(true)}>
              {category ? "Удалить категорию" : "Удалить бренд"}
            </Button>
          )}
        </>
      )}
      {deleting && initial && (
        <Sheet
          open
          title={category ? "Удалить категорию?" : "Удалить бренд?"}
          onOpenChange={(open) => {
            if (!open && !busy) setDeleting(false);
          }}
          form
        >
          <div className="space-y-3">
            {needsTransfer && (
              <fieldset>
                <legend className="text-label">Выберите, куда перенести товары</legend>
                <Radio
                  name="transfer-target"
                  label={category ? "Без категории" : "Без бренда"}
                  checked={destination === null}
                  disabled={busy}
                  onChange={() => setDestination(null)}
                />
                {targetsFor(groups, initial.id).map((row) => (
                  <Radio
                    key={row.id}
                    name="transfer-target"
                    label={row.name}
                    checked={destination === row.id}
                    disabled={busy}
                    onChange={() => setDestination(row.id)}
                  />
                ))}
              </fieldset>
            )}
            {remove.error && (
              <p role="alert" className="text-status-danger-foreground">
                {remove.error.message}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" disabled={busy} onClick={() => setDeleting(false)}>
                Отменить
              </Button>
              <Button loading={busy} disabled={needsTransfer && destination === undefined} onClick={deleteGroup}>
                {needsTransfer ? "Перенести и удалить" : "Удалить"}
              </Button>
            </div>
          </div>
        </Sheet>
      )}
    </CatalogEditorFrame>
  );
}
