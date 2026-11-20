import { useEffect, useState } from "react";
import { useToast } from "../../../../app/shell/ToastProvider";
import type { SellerBulkInput, SellerProduct, SellerProductRow } from "../../../../shared/contracts/seller-catalog";
import { Button } from "../../../../ui/Button";
import { Checkbox } from "../../../../ui/Checkbox";
import { Input } from "../../../../ui/Input";
import { ListItem } from "../../../../ui/ListItem";
import { Radio } from "../../../../ui/Radio";
import { Sheet } from "../../../../ui/Sheet";
import { type BulkResult, fetchCatalogProduct, useCatalogCommand, useCatalogGroups } from "../../catalog-api";

type Step = "menu" | "pause" | "resume" | "stock" | "category" | "delete";
const titles: Record<Step, string> = {
  menu: "Действия с товарами",
  pause: "Снять с продажи",
  resume: "Сколько есть?",
  stock: "Изменить остаток",
  category: "Перенести в категорию",
  delete: "Удалить товары?",
};
const failures: Record<string, string> = {
  VERSION_CONFLICT: "Товар изменился",
  NOT_FOUND: "Товар удалён",
  STOCK_CHANGED: "Остаток изменился",
  VISIBILITY_REQUIRED: "Проверьте видимость товара и фасовок",
  STOCK_REQUIRED: "Укажите остаток",
};
export function CatalogActions({
  store,
  rows,
  intent,
  onClose,
  onApplied,
}: {
  store: string;
  rows: SellerProductRow[];
  intent?: "pause" | "resume";
  onClose: () => void;
  onApplied: (ids: string[]) => void;
}) {
  const [step, setStep] = useState<Step>(intent ?? "menu");
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [result, setResult] = useState<BulkResult>();
  const [loading, setLoading] = useState(false);
  const [stock, setStock] = useState("");
  const [unlimited, setUnlimited] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [category, setCategory] = useState<string | null>();
  const [error, setError] = useState("");
  const write = useCatalogCommand<BulkResult>(store);
  const groupList = useCatalogGroups(store, "categories", step === "category");
  const toast = useToast();
  const busy = write.isPending || loading;
  function apply(action: SellerBulkInput["action"], checkResume = false) {
    setError("");
    write.mutate(
      { path: "/bulk", input: { action, products: rows.map(({ id, revision }) => ({ id, revision })) } },
      {
        onSuccess: (data) => {
          if (checkResume && !data.applied.length && data.failed.every((row) => row.code === "STOCK_REQUIRED")) {
            void loadStock("resume");
            return;
          }
          onApplied(data.applied);
          if (data.failed.length) setResult(data);
          else {
            toast(`Применилось к товарам: ${data.applied.length}`);
            onClose();
          }
        },
      },
    );
  }
  async function loadStock(next: "stock" | "resume") {
    setLoading(true);
    setStep(next);
    setError("");
    try {
      const list = await Promise.all(rows.map((row) => fetchCatalogProduct(store, row.id)));
      setProducts(list);
      const selected = list.flatMap((row) =>
        row.variants
          .filter((variant) => next === "stock" || (variant.visible && variant.stock === 0))
          .map((variant) => variant.id),
      );
      setIds(selected);
      if (next === "resume" && !selected.length) apply({ kind: "resume" });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось загрузить данные");
    } finally {
      setLoading(false);
    }
  }
  function resume() {
    if (rows.some((row) => row.status === "unavailable" && row.stock === null && row.salePause === null))
      void loadStock("resume");
    else apply({ kind: "resume" }, true);
  }
  useEffect(() => {
    if (intent !== "resume") return;
    const controller = new AbortController();
    setLoading(true);
    void Promise.all(rows.map((row) => fetchCatalogProduct(store, row.id, controller.signal)))
      .then((list) => {
        setProducts(list);
        setIds(
          list.flatMap((row) =>
            row.variants.filter((variant) => variant.visible && variant.stock === 0).map((variant) => variant.id),
          ),
        );
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error.message : "Не удалось загрузить данные");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [intent, rows, store]);
  function confirmStock() {
    if (
      !unlimited &&
      (!/^\d+$/u.test(stock) || !Number.isSafeInteger(Number(stock)) || (step === "resume" && Number(stock) === 0))
    ) {
      setError(step === "resume" ? "Введите целое число от 1" : "Введите целое число от 0");
      return;
    }
    const variants = products.flatMap((row) =>
      row.variants
        .filter((variant) => ids.includes(variant.id))
        .map((variant) => ({
          id: variant.id,
          stock: unlimited ? null : Number(stock),
          revision: variant.stockRevision,
        })),
    );
    if (step === "resume") apply({ kind: "resume", stock: variants.length ? variants : undefined });
    else if (variants.length) apply({ kind: "stock", variants });
  }
  return (
    <Sheet
      open
      title={result ? "Действие применилось частично" : titles[step]}
      description={
        result ? `Применилось к товарам: ${result.applied.length} из ${rows.length}` : `Выбрано товаров: ${rows.length}`
      }
      form
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      onBack={
        !busy && step !== "menu" && !intent
          ? () => {
              setStep("menu");
              setError("");
            }
          : undefined
      }
    >
      <div className="space-y-2">
        {result ? (
          <>
            <h3 className="text-label">Не применилось</h3>
            <ul>
              {result.failed.map((row) => (
                <li key={row.id} className="rounded-lg bg-input p-3">
                  <p>{row.name ?? rows.find((item) => item.id === row.id)?.name}</p>
                  <p className="text-small text-muted-foreground">{failures[row.code] ?? row.code}</p>
                </li>
              ))}
            </ul>
            <Button full onClick={onClose}>
              Готово
            </Button>
          </>
        ) : step === "menu" ? (
          <>
            <ListItem title="Снять с продажи" onClick={busy ? undefined : () => setStep("pause")} />
            <ListItem title="Вернуть в продажу" onClick={busy ? undefined : resume} />
            <ListItem title="Скрыть" onClick={busy ? undefined : () => apply({ kind: "hide" })} />
            <ListItem title="Показать" onClick={busy ? undefined : () => apply({ kind: "show" })} />
            <ListItem title="Перенести в категорию" onClick={busy ? undefined : () => setStep("category")} />
            <ListItem title="Изменить остаток" onClick={busy ? undefined : () => void loadStock("stock")} />
            <ListItem title="Удалить" onClick={busy ? undefined : () => setStep("delete")} />
          </>
        ) : step === "pause" ? (
          <>
            <Button
              full
              variant="secondary"
              loading={busy}
              onClick={() => apply({ kind: "pause", duration: "tomorrow" })}
            >
              До завтра
            </Button>
            <Button
              full
              variant="secondary"
              disabled={busy}
              onClick={() => apply({ kind: "pause", duration: "manual" })}
            >
              Пока не верну
            </Button>
          </>
        ) : step === "category" ? (
          <>
            <Radio
              name="bulk-category"
              label="Без категории"
              checked={category === null}
              onChange={() => setCategory(null)}
            />
            {groupList.data?.groups.map((group) => (
              <Radio
                key={group.id}
                name="bulk-category"
                label={group.name}
                checked={category === group.id}
                disabled={busy}
                onChange={() => setCategory(group.id)}
              />
            ))}
            <Button
              full
              loading={busy}
              disabled={category === undefined}
              onClick={() => {
                if (category !== undefined) apply({ kind: "category", categoryId: category });
              }}
            >
              Перенести
            </Button>
          </>
        ) : step === "delete" ? (
          <>
            <p>Будет удалено товаров: {rows.length}. Оформленные заказы сохранятся.</p>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={busy} onClick={() => setStep("menu")}>
                Отмена
              </Button>
              <Button loading={busy} onClick={() => apply({ kind: "delete" })}>
                Удалить
              </Button>
            </div>
          </>
        ) : (
          <>
            {products.flatMap((row) =>
              row.variants
                .filter((variant) => step === "stock" || (variant.visible && variant.stock === 0))
                .map((variant) => (
                  <Checkbox
                    key={variant.id}
                    label={[row.name, variant.name].filter(Boolean).join(" · ")}
                    disabled={busy}
                    checked={ids.includes(variant.id)}
                    onChange={(event) =>
                      setIds(event.target.checked ? [...ids, variant.id] : ids.filter((id) => id !== variant.id))
                    }
                  />
                )),
            )}
            <Input
              label="Остаток"
              inputMode="numeric"
              value={stock}
              onChange={(event) => setStock(event.target.value)}
              disabled={busy || unlimited}
            />
            <Button
              variant={unlimited ? "soft" : "secondary"}
              aria-pressed={unlimited}
              disabled={busy}
              onClick={() => setUnlimited((value) => !value)}
            >
              Без лимита
            </Button>
            <Button full loading={busy} disabled={!ids.length} onClick={confirmStock}>
              {step === "resume" ? "Вернуть в продажу" : "Применить"}
            </Button>
          </>
        )}
        {(error || write.error || groupList.isError) && (
          <p role="alert" className="text-status-danger-foreground">
            {error || write.error?.message || groupList.error?.message}
          </p>
        )}
      </div>
    </Sheet>
  );
}
