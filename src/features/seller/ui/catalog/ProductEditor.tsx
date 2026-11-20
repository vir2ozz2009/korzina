import { Plus } from "lucide-react";
import { useState } from "react";
import { useToast } from "../../../../app/shell/ToastProvider";
import type { SellerProduct, SellerProductInput, SellerStockInput } from "../../../../shared/contracts/seller-catalog";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { Dialog } from "../../../../ui/Dialog";
import { ListItem } from "../../../../ui/ListItem";
import { type BulkResult, type ProductSave, useCatalogCommand, useCatalogGroups } from "../../catalog-api";
import { CatalogEditorFrame, type CatalogFrame } from "./CatalogEditorFrame";
import { CatalogPhotos, useCatalogPhotos } from "./CatalogPhotos";
import { GroupPicker } from "./GroupPicker";
import { useCatalogNav } from "./navigation";
import { initialProductText, ProductStatusFields, ProductTextFields } from "./ProductFields";
import { ProductRecommendations } from "./ProductRecommendations";
import { ProductSalePrompt } from "./ProductSalePrompt";
import { ProductStockPrompt } from "./ProductStockPrompt";
import { type VariantDraft, VariantFields, variantDraft, variantInput } from "./VariantFields";

type Modal = "categories" | "brands" | "recommendations" | "delete" | "pause" | "quantity";
export function ProductEditor({
  store,
  currency,
  canWrite,
  storefront,
  initial,
  frame,
}: {
  store: string;
  currency: string;
  canWrite: boolean;
  storefront: string;
  initial?: SellerProduct;
  frame: CatalogFrame;
}) {
  const nav = useCatalogNav(store);
  const [baseline, setBaseline] = useState(initial);
  const [text, setText] = useState(() =>
    initialProductText(initial, nav.params.get("category") ?? undefined, nav.params.get("brand") ?? undefined),
  );
  const [initialText] = useState(text);
  const [variants, setVariants] = useState(
    () => initial?.variants.map((row) => variantDraft(currency, row)) ?? [variantDraft(currency)],
  );
  const [initialVariants] = useState(variants);
  const [editing, setEditing] = useState<{ index: number; value: VariantDraft }>();
  const [pause, setPause] = useState<SellerProductInput["pause"]>();
  const [modal, setModal] = useState<Modal>();
  const [error, setError] = useState("");
  const [partial, setPartial] = useState<{ result: ProductSave; desired: Record<string, number | null> }>();
  const photos = useCatalogPhotos(store, baseline?.photos ?? []);
  const categories = useCatalogGroups(store, "categories");
  const brands = useCatalogGroups(store, "brands");
  const save = useCatalogCommand<ProductSave>(store);
  const remove = useCatalogCommand<BulkResult>(store);
  const toast = useToast();
  const busy = save.isPending || remove.isPending;
  const disabled = !canWrite || busy;
  const dirty =
    canWrite &&
    !partial &&
    (photos.dirty ||
      !!pause ||
      JSON.stringify(initialText) !== JSON.stringify(text) ||
      JSON.stringify(initialVariants) !== JSON.stringify(variants));
  const path = baseline ? `/products/${encodeURIComponent(baseline.id)}` : "/products";
  function patchText(patch: Partial<typeof text>) {
    setText((current) => ({ ...current, ...patch }));
    setError("");
  }
  function patchVariant(index: number, update: Partial<VariantDraft>) {
    setVariants((current) => current.map((row, i) => (i === index ? { ...row, ...update } : row)));
    setError("");
  }
  function pickStatus(status: typeof text.status) {
    if (status === text.status) return;
    const visible = variants.filter((row) => row.visible);
    const stocked = visible.some((row) => row.unlimited || Number(row.stock) > 0);
    if (status !== "hidden" && !visible.length) {
      setError("Включите хотя бы одну фасовку");
      return;
    }
    if (status === "selling" && !stocked) {
      setModal("quantity");
    } else if (status === "unavailable" && stocked && text.status !== "unavailable") setModal("pause");
    else {
      if (status === "selling") {
        setVariants((current) =>
          current.map((row) =>
            row.visible && (row.pause || row.salePause !== null) ? { ...row, pause: "resume" } : row,
          ),
        );
        setPause(undefined);
      }
      patchText({ status });
    }
  }
  function saveProduct() {
    if (photos.pending) {
      setError("Дождитесь завершения загрузки фото");
      return;
    }
    try {
      if (!text.name.trim()) throw new Error("Введите название");
      const pack = variants.map((row) => variantInput(row, currency, variants.length > 1));
      setError("");
      save.mutate(
        {
          path,
          input: {
            ...text,
            name: text.name.trim(),
            expectedRevision: baseline?.revision,
            variants: pack,
            photos: photos.values,
            pause,
          },
        },
        {
          onSuccess: (result) => {
            if (result.conflicts.length) {
              setBaseline(result.product);
              setPartial({
                result,
                desired: Object.fromEntries(pack.flatMap((row) => (row.id ? [[row.id, row.stock]] : []))),
              });
              return;
            }
            toast("Сохранено");
            nav.leave("/seller/products", true);
          },
        },
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "Проверьте поля");
    }
  }
  function confirmStock(input: SellerStockInput) {
    save.mutate(
      { path: `${path}/stock`, input },
      {
        onSuccess: (result) => {
          if (result.conflicts.length && partial) setPartial({ ...partial, result });
          else {
            toast("Сохранено");
            nav.leave("/seller/products", true);
          }
        },
      },
    );
  }
  function copyProduct() {
    if (!baseline) return;
    save.mutate(
      { path: `${path}/copy`, input: { revision: baseline.revision } },
      {
        onSuccess: (result) => {
          toast("Товар скопирован");
          nav.open(`/seller/products/${encodeURIComponent(result.product.id)}`, undefined, true, true);
        },
      },
    );
  }
  return (
    <CatalogEditorFrame
      frame={frame}
      store={store}
      fallback="/seller/products"
      dirty={dirty && !editing}
      busy={busy}
      onSave={saveProduct}
    >
      {editing ? (
        <Card className="space-y-3">
          <h2 className="text-title-3">{editing.value.id ? "Редактировать фасовку" : "Новая фасовка"}</h2>
          <VariantFields
            row={editing.value}
            multiple
            disabled={disabled}
            sale
            patch={(patch) => setEditing({ ...editing, value: { ...editing.value, ...patch } })}
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
      ) : (
        <>
          <ProductTextFields
            draft={text}
            update={patchText}
            category={categories.data?.groups.find((row) => row.id === text.categoryId)}
            brand={brands.data?.groups.find((row) => row.id === text.brandId)}
            disabled={disabled}
            onCategory={() => setModal("categories")}
            onBrand={() => setModal("brands")}
            error={error === "Введите название" ? error : undefined}
          />
          <Card className="space-y-3">
            <CatalogPhotos photos={photos} disabled={disabled} />
          </Card>
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
          <ProductStatusFields
            draft={text}
            disabled={disabled}
            changeStatus={pickStatus}
            onRecommendations={() => setModal("recommendations")}
            update={patchText}
          />
          {baseline && (
            <>
              {baseline.status !== "hidden" && text.status !== "hidden" && (
                <Button
                  full
                  variant="secondary"
                  onClick={() => {
                    window.open(
                      new URL(`/p/${encodeURIComponent(baseline.id)}`, storefront),
                      "_blank",
                      "noopener,noreferrer",
                    );
                  }}
                >
                  Посмотреть на витрине
                </Button>
              )}
              {canWrite && (
                <Button full variant="secondary" disabled={busy || dirty} onClick={copyProduct}>
                  Копировать товар
                </Button>
              )}
              {canWrite && (
                <Button
                  full
                  variant="ghost"
                  className="text-status-danger-foreground"
                  disabled={busy}
                  onClick={() => setModal("delete")}
                >
                  Удалить товар
                </Button>
              )}
            </>
          )}
        </>
      )}
      {!partial && (error || save.error || remove.error) && (
        <p role="alert" className="text-status-danger-foreground">
          {error || save.error?.message || remove.error?.message}
        </p>
      )}
      {(modal === "categories" || modal === "brands") && (
        <GroupPicker
          store={store}
          kind={modal}
          groups={(modal === "categories" ? categories : brands).data?.groups ?? []}
          onClose={() => setModal(undefined)}
          onSelect={(id) => {
            patchText(modal === "categories" ? { categoryId: id } : { brandId: id });
            setModal(undefined);
          }}
        />
      )}
      {modal === "recommendations" && (
        <ProductRecommendations
          store={store}
          productId={baseline?.id}
          initial={text.recommendationIds}
          onClose={() => setModal(undefined)}
          onConfirm={(ids) => {
            patchText({ recommendationIds: ids });
            setModal(undefined);
          }}
        />
      )}
      {(modal === "pause" || modal === "quantity") && (
        <ProductSalePrompt
          kind={modal}
          onClose={() => setModal(undefined)}
          onPause={(duration) => {
            setPause(duration);
            patchText({ status: "unavailable" });
            setModal(undefined);
          }}
          onRestore={(stock) => {
            setVariants((current) =>
              current.map((row) =>
                row.visible ? { ...row, stock: stock ?? "", unlimited: stock === null, pause: "resume" } : row,
              ),
            );
            setPause(undefined);
            patchText({ status: "selling" });
            setModal(undefined);
          }}
        />
      )}
      {modal === "delete" && baseline && (
        <Dialog
          open
          title="Удалить товар?"
          description="Товар исчезнет из каталога и витрины. Оформленные заказы сохранятся."
          confirm="Удалить товар"
          loading={remove.isPending}
          onOpenChange={(open) => {
            if (!open && !remove.isPending) setModal(undefined);
          }}
          onConfirm={() =>
            remove.mutate(
              {
                path: "/bulk",
                input: {
                  products: [{ id: baseline.id, revision: baseline.revision }],
                  action: { kind: "delete" },
                },
              },
              {
                onSuccess: (data) => {
                  if (data.failed.length) {
                    setError("Данные изменились");
                    setModal(undefined);
                  } else {
                    toast("Товар удалён");
                    nav.leave("/seller/products", true);
                  }
                },
              },
            )
          }
        />
      )}
      {partial && (
        <ProductStockPrompt
          conflicts={partial.result.conflicts}
          initial={partial.desired}
          onClose={() => nav.leave("/seller/products", true)}
          onConfirm={confirmStock}
          busy={busy}
          error={save.error?.message}
        />
      )}
    </CatalogEditorFrame>
  );
}
