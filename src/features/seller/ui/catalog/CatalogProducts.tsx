import { Plus } from "lucide-react";
import { type ReactNode, useDeferredValue, useState } from "react";
import { QueryBoundary } from "../../../../app/shell/QueryBoundary";
import { useToast } from "../../../../app/shell/ToastProvider";
import type { SellerBulkInput, SellerProductRow } from "../../../../shared/contracts/seller-catalog";
import { HttpError } from "../../../../shared/http-error";
import { Button } from "../../../../ui/Button";
import { Chip } from "../../../../ui/Chip";
import { EmptyState } from "../../../../ui/EmptyState";
import { ListItem } from "../../../../ui/ListItem";
import { Price } from "../../../../ui/Price";
import { ProductImage } from "../../../../ui/ProductImage";
import { SearchField } from "../../../../ui/SearchField";
import { StatusPill } from "../../../../ui/StatusPill";
import { Switch } from "../../../../ui/Switch";
import { type BulkResult, useCatalogCommand, useCatalogProducts } from "../../catalog-api";
import { CatalogActions } from "./CatalogActions";
import { displayImage } from "./CatalogPhotos";
import { useCatalogNav } from "./navigation";

export const catalogStatus = { selling: "В продаже", unavailable: "Нет в наличии", hidden: "Скрыт" };
const filters = [
  { value: "all", label: "Все" },
  { value: "out_of_stock", label: "Нет в наличии" },
  { value: "low_stock", label: "Заканчиваются" },
  { value: "hidden", label: "Скрытые" },
  { value: "uncategorized", label: "Без категории" },
] as const;

export function CatalogProducts({
  store,
  currency,
  canWrite,
  frame,
}: {
  store: string;
  currency: string;
  canWrite: boolean;
  frame: (children: ReactNode, footer?: ReactNode) => ReactNode;
}) {
  const nav = useCatalogNav(store);
  const [picked, setPicked] = useState<SellerProductRow[]>([]);
  const [action, setAction] = useState<{ rows: SellerProductRow[]; intent?: "pause" | "resume" }>();
  const command = useCatalogCommand<BulkResult>(store);
  const toast = useToast();
  const search = nav.params.get("q") ?? "";
  const filter = filters.find((row) => row.value === nav.params.get("filter"))?.value ?? "all";
  const category = nav.params.get("category") ?? undefined;
  const brand = nav.params.get("brand") ?? undefined;
  const query = useCatalogProducts(store, { filter, q: useDeferredValue(search), category, brand });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  function change(q: string, filter: string) {
    setPicked([]);
    nav.open("/seller/products", { q, filter, category, brand }, true);
  }
  function openProduct(id: string) {
    nav.open(`/seller/products/${encodeURIComponent(id)}`, { category, brand });
  }
  function changeVisibility(row: SellerProductRow) {
    const input: SellerBulkInput = { products: [{ id: row.id, revision: row.revision }], action: { kind: "show" } };
    command.mutate(
      { path: "/bulk", input },
      {
        onSuccess: ({ failed }) =>
          toast(failed.length ? "Включите хотя бы одну фасовку или обновите товар" : "Товар показан"),
        onError: (error) => toast(error.message),
      },
    );
  }
  function switchSale(row: SellerProductRow) {
    if (row.status === "selling") setAction({ rows: [row], intent: "pause" });
    else
      command.mutate(
        {
          path: "/bulk",
          input: { products: [{ id: row.id, revision: row.revision }], action: { kind: "resume" } },
        },
        {
          onSuccess: ({ failed }) => {
            if (failed[0]?.code === "STOCK_REQUIRED") setAction({ rows: [row], intent: "resume" });
            else toast(failed.length ? "Данные изменились" : "Товар снова в продаже");
          },
          onError: (error) => toast(error.message),
        },
      );
  }
  const footer = picked.length ? (
    <div className="flex gap-2">
      <Button onClick={() => setAction({ rows: picked })}>Действия</Button>
      <Button variant="secondary" onClick={() => setPicked([])}>
        Снять выбор
      </Button>
    </div>
  ) : (
    <Button full icon={<Plus size={18} />} onClick={() => openProduct("new")}>
      Добавить товар
    </Button>
  );

  return frame(
    <>
      <div className="[&_[data-field-surface]]:bg-card">
        <SearchField value={search} onChange={(q) => change(q, filter)} />
      </div>
      <fieldset aria-label="Фильтры товаров" className="flex flex-wrap gap-1">
        {filters.map((choice) => (
          <Chip
            key={choice.value}
            className="px-2! text-small!"
            selected={filter === choice.value}
            onClick={() => change(search, choice.value)}
          >
            {choice.label}
          </Chip>
        ))}
      </fieldset>
      <QueryBoundary query={query} template="list">
        {() =>
          items.length ? (
            <>
              <ul className="space-y-2">
                {items.map((row) => (
                  <li key={row.id} data-product-status={row.status} className="min-w-0 rounded-xl bg-card">
                    <div className="flex items-center">
                      <div className="min-w-0 flex-1">
                        <ListItem
                          title={row.name}
                          icon={<ProductImage {...displayImage(row.image)} alt="" className="size-14" />}
                          subtitle={
                            row.status === "unavailable"
                              ? row.salePause
                                ? "До завтра"
                                : undefined
                              : row.stock !== null
                                ? `${row.stock} шт.`
                                : row.status === "selling"
                                  ? "Без лимита"
                                  : undefined
                          }
                          value={
                            <span className="flex flex-col items-end gap-1 text-right">
                              {row.priceMinor !== null && (
                                <Price
                                  amountMinor={row.priceMinor}
                                  from={row.variantCount > 1}
                                  currency={currency}
                                  size="title-3"
                                />
                              )}
                              <StatusPill
                                tone={
                                  row.status === "selling"
                                    ? "success"
                                    : row.status === "unavailable"
                                      ? "warning"
                                      : "neutral"
                                }
                              >
                                {catalogStatus[row.status]}
                              </StatusPill>
                            </span>
                          }
                          onClick={() => openProduct(row.id)}
                        />
                      </div>
                      {canWrite && (
                        <label className="flex min-h-11 min-w-11 items-center justify-center">
                          <input
                            type="checkbox"
                            aria-label={`Выбрать товар: ${row.name}`}
                            className="size-5 accent-primary"
                            checked={picked.some((item) => item.id === row.id)}
                            onChange={(event) =>
                              setPicked(
                                event.target.checked ? [...picked, row] : picked.filter((item) => item.id !== row.id),
                              )
                            }
                          />
                        </label>
                      )}
                    </div>
                    {canWrite && (
                      <div className="border-t border-border px-3">
                        {row.status === "hidden" ? (
                          <div className="flex justify-end py-1">
                            <Button
                              variant="secondary"
                              disabled={command.isPending}
                              onClick={() => changeVisibility(row)}
                            >
                              Показать
                            </Button>
                          </div>
                        ) : (
                          <Switch
                            label="Наличие"
                            aria-label={`В продаже: ${row.name}`}
                            checked={row.status === "selling"}
                            disabled={command.isPending}
                            onChange={() => switchSale(row)}
                          />
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {query.isFetchNextPageError && <p role="alert">{query.error?.message}</p>}
              {query.hasNextPage && (
                <Button
                  variant="secondary"
                  full
                  loading={query.isFetchingNextPage}
                  onClick={() => {
                    if (query.error instanceof HttpError && query.error.code === "VERSION_CONFLICT")
                      void query.refetch();
                    else void query.fetchNextPage();
                  }}
                >
                  {query.isFetchNextPageError ? "Повторить" : "Показать ещё"}
                </Button>
              )}
            </>
          ) : (
            <EmptyState
              title={search ? "Ничего не найдено" : "Товаров пока нет"}
              action={search || filter !== "all" ? "Все товары" : undefined}
              onAction={() => change("", "all")}
            />
          )
        }
      </QueryBoundary>
      {action && (
        <CatalogActions
          store={store}
          rows={action.rows}
          intent={action.intent}
          onClose={() => setAction(undefined)}
          onApplied={(applied) => setPicked((selection) => selection.filter((row) => !applied.includes(row.id)))}
        />
      )}
    </>,
    canWrite ? footer : undefined,
  );
}
