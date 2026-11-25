import { useNavigate, useRouterState } from "@tanstack/react-router";
import { sellerHistory } from "../../../../app/shell/tab-history";
import type { SalesPeriod } from "../../../../shared/contracts/seller-sales";
import { calendarDate, defaultShopTimeZone, shopDateTime } from "../../../../shared/datetime";
import { formatMinor } from "../../../../shared/money";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { EmptyState } from "../../../../ui/EmptyState";
import { Select } from "../../../../ui/Select";
import { noSalesAccess, type SalesSession, useProductSales } from "../../sales-api";
import { lengthInDays, periodPreset } from "./dates";
import { PeriodPicker } from "./PeriodPicker";
import { SalesQuery } from "./SalesProducts";

export function ProductReport({ session }: { session: SalesSession }) {
  const { search, pathname, href } = useRouterState({ select: (state) => state.location });
  const navigate = useNavigate();
  const id = decodeURIComponent(pathname.split("/").at(-1) ?? "");
  const zone = session.timeZone ?? defaultShopTimeZone;
  const period = search.from && search.to ? { from: search.from, to: search.to } : {};
  const query = useProductSales(session, id, period, search.variant);
  if (noSalesAccess(query.error)) return <EmptyState title="Доступ ограничен" />;
  const dates =
    query.data?.period ??
    (search.from && search.to ? { from: search.from, to: search.to } : periodPreset(zone, 7, true));
  const apply = (dates: SalesPeriod, variant = search.variant) =>
    void navigate({
      to: "/seller/statistics/products/$id",
      params: { id },
      replace: true,
      search: { ...search, store: session.store, ...dates, variant },
    });
  return (
    <>
      <Card>
        <PeriodPicker period={dates} timeZone={query.data?.timeZone ?? zone} weeks apply={apply} />
      </Card>
      <SalesQuery query={query} title="Не удалось загрузить статистику товара">
        {(data) => (
          <Card>
            <h3 className="text-title-2">{data.name}</h3>
            <Select
              label="Фасовка"
              value={search.variant ?? ""}
              options={[
                { value: "", label: "Все фасовки" },
                ...data.variants.map((variant) => ({
                  value: variant.id,
                  label: `${variant.unit}${variant.archived ? " · Архивная" : ""}`,
                })),
              ]}
              onChange={(variant) =>
                void navigate({
                  to: "/seller/statistics/products/$id",
                  params: { id },
                  replace: true,
                  search: { ...search, store: session.store, ...data.period, variant: variant || undefined },
                })
              }
            />
            <dl className="grid grid-cols-3 gap-2 text-small">
              <div>
                <dt>Продано</dt>
                <dd className="text-label">{data.quantity} шт.</dd>
              </div>
              <div>
                <dt>Заказы</dt>
                <dd className="text-label">{data.orderCount}</dd>
              </div>
              <div>
                <dt>Выручка</dt>
                <dd className="text-label">{formatMinor(data.revenueMinor, data.currency)}</dd>
              </div>
            </dl>
            {data.incomplete ? (
              <p className="text-small">Данные за период неполные</p>
            ) : (
              !data.archived &&
              data.period.to <= calendarDate(shopDateTime(Date.now(), data.timeZone).date, -1) && (
                <p className="text-small">{weeklyPace(data.quantity, data.period)}</p>
              )
            )}
            {data.canOpenProduct && (
              <Button
                full
                variant="secondary"
                onClick={() => {
                  const back = new URL(href, window.location.origin);
                  back.searchParams.set("from", data.period.from);
                  back.searchParams.set("to", data.period.to);
                  const target = back.pathname + back.search;
                  sellerHistory.savePosition(target, window.scrollY);
                  const query = new URLSearchParams({ store: session.store, back: target });
                  if (search.shop) query.set("shop", search.shop);
                  void navigate({ href: `/seller/products/${encodeURIComponent(id)}?${query}` });
                }}
              >
                Открыть карточку товара
              </Button>
            )}
          </Card>
        )}
      </SalesQuery>
      {search.variant && query.isError && (
        <Button
          variant="secondary"
          onClick={() =>
            void navigate({
              to: "/seller/statistics/products/$id",
              params: { id },
              replace: true,
              search: { ...search, variant: undefined },
            })
          }
        >
          Все фасовки
        </Button>
      )}
    </>
  );
}

function weeklyPace(quantity: number, period: SalesPeriod) {
  if (!quantity) return "За период продаж не было";
  const pace = (quantity * 7) / lengthInDays(period);
  return `При таком темпе за неделю — ${pace < 1 ? "меньше 1" : `около ${Math.round(pace)}`} шт.`;
}
