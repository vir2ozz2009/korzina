import { useRef, useState } from "react";
import { useToast } from "../../../../app/shell/ToastProvider";
import type { SellerProduct, SellerProductInput, SellerStockInput } from "../../../../shared/contracts/seller-catalog";
import { HttpError } from "../../../../shared/http-error";
import { type BulkResult, type ProductSave, useCatalogCommand, useCatalogGroups } from "../../catalog-api";
import { useCatalogPhotos } from "./CatalogPhotos";
import { useCatalogNav } from "./navigation";
import { initialProductText } from "./ProductFields";
import { type VariantDraft, variantDraft, variantInput } from "./VariantFields";

type Modal = "categories" | "brands" | "recommendations" | "delete" | "pause" | "quantity";

export function useProductEditor(store: string, currency: string, canWrite: boolean, initial?: SellerProduct) {
  const saving = useRef(false);
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
  const [editing, setEditing] = useState<{ index: number; value: VariantDraft; nameError?: string } | undefined>(() => {
    const index = variants.findIndex((variant) => variant.id === nav.params.get("variant"));
    return index >= 0 ? { index, value: variants[index] } : undefined;
  });
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
  function showVariantNameError(index: number, message: string, rows = variants) {
    setError("");
    save.reset();
    setEditing({ index, value: rows[index], nameError: message });
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
    saveRows(variants);
  }
  function confirmVariant() {
    if (disabled || saving.current || !editing) return;
    const rows = [...variants];
    rows[editing.index] = editing.value;
    setVariants(rows);
    if (baseline) saveRows(rows);
    else setEditing(undefined);
  }
  function saveRows(rows: VariantDraft[]) {
    if (disabled || saving.current) return;

    if (photos.pending) {
      setError("Дождитесь завершения загрузки фото");
      return;
    }
    try {
      if (!text.name.trim()) throw new Error("Введите название");
      const unnamed = rows.length > 1 ? rows.findIndex((row) => !row.name.trim()) : -1;
      if (unnamed !== -1) {
        showVariantNameError(unnamed, "Укажите название фасовки", rows);
        return;
      }
      const pack = rows.map((row) => variantInput(row, currency));
      setError("");
      saving.current = true;
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
          onSettled: () => {
            saving.current = false;
          },
          onError: (error) => {
            if (!(error instanceof HttpError)) return;
            const { details } = error;
            if (!details || typeof details !== "object" || !("index" in details)) return;
            const { index } = details;
            if (typeof index !== "number" || !rows[index]) return;
            if (error.code === "DUPLICATE_VARIANT_NAME" || ("field" in details && details.field === "variantName"))
              showVariantNameError(index, error.message, rows);
          },
          onSuccess: (result) => {
            if (result.conflicts.length) {
              setEditing(undefined);
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
  const saveMessage =
    save.error instanceof HttpError && save.error.code === "VERSION_CONFLICT"
      ? "Данные товара изменились. Сверьте актуальную версию перед сохранением."
      : save.error instanceof TypeError
        ? "Нет связи. Повторите."
        : save.error?.message;
  const pricePreview = (zone: string) => ({
    currency,
    zone,
    product: { name: text.name, image: photos.items[0]?.src },
    save: editing ? confirmVariant : saveProduct,
    error: error || saveMessage,
    busy,
  });
  return {
    nav,
    baseline,
    text,
    variants,
    setVariants,
    editing,
    setEditing,
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
    saveMessage,
    pricePreview,
    remove,
    toast,
    busy,
    disabled,
    dirty,
    patchText,
    patchVariant,
    pickStatus,
    saveProduct,
    confirmVariant,
    confirmStock,
    copyProduct,
  };
}
