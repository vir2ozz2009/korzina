import type { SellerProduct } from "../../../../shared/contracts/seller-catalog";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { Dialog } from "../../../../ui/Dialog";
import { CatalogEditorFrame, type CatalogFrame } from "./CatalogEditorFrame";
import { CatalogPhotos } from "./CatalogPhotos";
import { GroupPicker } from "./GroupPicker";
import { ProductStatusFields, ProductTextFields } from "./ProductFields";
import { ProductRecommendations } from "./ProductRecommendations";
import { ProductSalePrompt } from "./ProductSalePrompt";
import { ProductStockPrompt } from "./ProductStockPrompt";
import { ProductVariantEditor, ProductVariants } from "./ProductVariants";
import { useProductEditor } from "./useProductEditor";

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
  const editor = useProductEditor(store, currency, canWrite, initial);
  const {
    nav,
    baseline,
    text,
    setVariants,
    editing,
    setPause,
    modal,
    setModal,
    error,
    setError,
    partial,
    photos,
    categories,
    brands,
    save,
    remove,
    toast,
    busy,
    disabled,
    dirty,
    patchText,
    pickStatus,
    saveProduct,
    confirmStock,
    copyProduct,
  } = editor;
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
        <ProductVariantEditor editor={editor} canWrite={canWrite} editing={editing} />
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
          <ProductVariants editor={editor} canWrite={canWrite} currency={currency} />
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
