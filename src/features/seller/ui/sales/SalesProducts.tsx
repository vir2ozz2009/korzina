import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { QueryResult } from "../../../../app/shell/QueryBoundary";
import { sellerHistory } from "../../../../app/shell/tab-history";
import type { SalesPeriod, SalesRank } from "../../../../shared/contracts/seller-sales";
import { calendarDate, defaultShopTimeZone, shopDateTime } from "../../../../shared/datetime";
import { formatMinor } from "../../../../shared/money";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { EmptyState } from "../../../../ui/EmptyState";
import { Select } from "../../../../ui/Select";
import { SkeletonText } from "../../../../ui/SkeletonText";
import { noSalesAccess, type SalesSession, useProductSales, useSalesRank } from "../../sales-api";
import { lengthInDays, periodPreset } from "./dates";
import { PeriodPicker } from "./PeriodPicker";

export function SalesQuery<T>({
  query,
  title,
  children,
}: {
  query: QueryResult<T>;
  title: string;
  children: (data: T) => ReactNode;
}) {
  if (noSalesAccess(query.error)) return <EmptyState title="Доступ ограничен" />;
  if (query.isError && query.data === undefined)
    return (
      <Card>
        <p role="status">{title}</p>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          Повторить
        </Button>
      </Card>
    );
  if (query.data !== undefined) return children(query.data);
  return (
    <Card aria-busy="true">
      <SkeletonText />
      <SkeletonText short />
    </Card>
  );
}

function RankRow({ row, period, store }: { row: SalesRank["rows"][number]; period: SalesPeriod; store: string }) {
  const href = useRouterState({ select: (state) => state.location.href });
  return (
    <Link
      to="/seller/statistics/products/$id"
      params={{ id: row.id }}
      search={(previous) => ({ shop: previous.shop, store, back: href, ...period })}
      onClick={() => sellerHistory.savePosition(href, window.scrollY)}
      className="block min-h-11 rounded-md py-2"
    >
      <div className="flex justify-between gap-3 text-label">
        <span>{row.name}</span>
        <span className="shrink-0">{row.quantity} шт.</span>
      </div>
      <div className="mt-2 h-1.5 rounded-pill bg-secondary" aria-hidden="true">
        <div className="h-full origin-left rounded-pill bg-primary" style={{ transform: `scaleX(${row.share})` }} />
      </div>
    </Link>
  );
}

export function RankPreview({ session, period }: { session: SalesSession; period: Partial<SalesPeriod> }) {
  const href = useRouterState({ select: (state) => state.location.href });
  const query = useSalesRank(session, period);
  return (
    <Card>
      <h3 className="text-title-3">Статистика продаж</h3>
      <SalesQuery query={query} title="Не удалось загрузить статистику продаж">
        {({ pages: [first] }) => (
          <>
            {first.rows.length ? (
              first.rows
                .slice(0, 3)
                .map((row) => <RankRow key={row.id} row={row} period={first.period} store={session.store} />)
            ) : (
              <EmptyState title="Пока нет товаров" />
            )}
            <Link
              to="/seller/statistics/products"
              search={(previous) => ({ shop: previous.shop, store: session.store, ...first.period, back: href })}
              onClick={() => sellerHistory.savePosition(href, window.scrollY)}
              className="flex min-h-11 items-center font-semibold text-primary-text"
            >
              Все товары
            </Link>
          </>
        )}
      </SalesQuery>
    </Card>
  );
}

export function SalesRanking({ session }: { session: SalesSession }) {
  const { search } = useRouterState({ select: (state) => state.location });
  const navigate = useNavigate();
  const zone = session.timeZone ?? defaultShopTimeZone;
  const period = search.from && search.to ? { from: search.from, to: search.to } : periodPreset(zone, 7, true);
  const query = useSalesRank(session, period, true);
  if (noSalesAccess(query.error)) return <EmptyState title="Доступ ограничен" />;
  return (
    <>
      <Card>
        <PeriodPicker
          period={period}
          timeZone={zone}
          weeks
          apply={(dates) =>
            void navigate({
              to: "/seller/statistics/products",
              replace: true,
              search: { ...search, store: session.store, ...dates },
            })
          }
        />
      </Card>
      <SalesQuery query={query} title="Не удалось загрузить статистику продаж">
        {({ pages }) => (
          <Card>
            {pages[0].rows.length ? (
              pages.flatMap(({ rows }) =>
                rows.map((row) => <RankRow key={row.id} row={row} store={session.store} period={period} />),
              )
            ) : (
              <EmptyState title="Пока нет товаров" />
            )}
            {query.isFetchNextPageError && <p role="status">Не удалось загрузить следующую страницу</p>}
            {query.hasNextPage && (
              <Button
                full
                variant="secondary"
                loading={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {query.isFetchNextPageError ? "Повторить" : "Показать ещё"}
              </Button>
            )}
          </Card>
        )}
      </SalesQuery>
    </>
  );
}

export function ProductReport({ session }: { session: SalesSession }) {
  const { search, pathname } = useRouterState({ select: (state) => state.location });
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
