import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { EmptyState } from "../../../../ui/EmptyState";
import type { SalesSession } from "../../sales-api";
import { SellerOrdersShell } from "../orders/SellerOrdersShell";
import { SalesOverview } from "./SalesOverview";
import { ProductReport, SalesRanking } from "./SalesProducts";

function Shell({
  title,
  children,
  onBack,
}: {
  title: string;
  children: (session: SalesSession) => ReactNode;
  onBack?: () => void;
}) {
  return (
    <SellerOrdersShell title={title} onBack={onBack}>
      {(store, money, account, timeZone, orders) =>
        money ? children({ store, account, timeZone, orders }) : <EmptyState title="Доступ ограничен" />
      }
    </SellerOrdersShell>
  );
}

export function SalesScreen() {
  const { pathname, search } = useRouterState({ select: (state) => state.location });
  const navigate = useNavigate();
  const productBack = search.back
    ? undefined
    : () =>
        void navigate({
          to: "/seller/statistics/products",
          replace: true,
          search: { shop: search.shop, store: search.store, from: search.from, to: search.to },
        });
  return pathname === "/seller/statistics" ? (
    <Shell title="Статистика">{(session) => <SalesOverview session={session} />}</Shell>
  ) : pathname === "/seller/statistics/products" ? (
    <Shell title="Статистика продаж">{(session) => <SalesRanking session={session} />}</Shell>
  ) : (
    <Shell title="Статистика товара" onBack={productBack}>
      {(session) => <ProductReport session={session} />}
    </Shell>
  );
}
