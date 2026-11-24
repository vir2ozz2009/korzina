import { Link, useRouterState } from "@tanstack/react-router";
import { ChartNoAxesColumn, ChevronRight } from "lucide-react";
import { sellerHistory } from "../../../../app/shell/tab-history";
import { formatMinor } from "../../../../shared/money";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { SkeletonText } from "../../../../ui/SkeletonText";
import { noSalesAccess, type SalesSession, useSalesSummary } from "../../sales-api";
import { periodLabel } from "./dates";

export function StatsCard({ session }: { session: SalesSession }) {
  const query = useSalesSummary(session);
  const href = useRouterState({ select: (state) => state.location.href });
  if (noSalesAccess(query.error)) return null;
  const data = query.isError ? undefined : query.data;
  return (
    <Card className="relative space-y-0!">
      <Link
        to="/seller/statistics"
        search={(previous) => ({ shop: previous.shop, store: session.store, ...data?.period })}
        onClick={() => sellerHistory.savePosition(href, window.scrollY)}
        className="flex min-h-6 items-center gap-2 rounded-md font-semibold text-title-3 after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-primary"
      >
        <ChartNoAxesColumn size={20} className="text-primary-text" aria-hidden="true" />
        Статистика
        <ChevronRight size={20} className="ml-auto" aria-hidden="true" />
      </Link>
      <p className="mt-2 text-small text-muted-foreground">Выручка за 7 дней</p>
      {data ? (
        <>
          <p className="text-title-2 tabular-nums">
            {data.revenueMinor === null ? "—" : formatMinor(data.revenueMinor, data.currency)}
          </p>
          <p className="text-small text-muted-foreground">{periodLabel(data.period)}</p>
          {data.incomplete && <p className="text-small text-muted-foreground">Данные за период неполные</p>}
        </>
      ) : query.isError ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-small text-muted-foreground" role="status">
            Не удалось загрузить выручку
          </p>
          <Button variant="ghost" className="relative z-10" onClick={() => void query.refetch()}>
            Повторить
          </Button>
        </div>
      ) : (
        <div aria-busy="true">
          <SkeletonText size="title" short />
        </div>
      )}
    </Card>
  );
}
