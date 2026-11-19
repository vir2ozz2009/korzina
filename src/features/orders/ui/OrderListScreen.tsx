import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Header } from "../../../app/shell/Header";
import { QueryBoundary } from "../../../app/shell/QueryBoundary";
import { Screen } from "../../../app/shell/Screen";
import { errorKind } from "../../../shared/http-error";
import { formatMinor } from "../../../shared/money";
import { Button } from "../../../ui/Button";
import { Chip } from "../../../ui/Chip";
import { EmptyState } from "../../../ui/EmptyState";
import { ListItem } from "../../../ui/ListItem";
import { ContactSheet } from "../../contact";
import { useBuyerOrders } from "../api";
import { orderStages } from "./active-orders";

export function OrderListScreen() {
  const [tab, setTab] = useState<"active" | "completed">("active");
  const [login, setLogin] = useState(false);
  const navigate = useNavigate();
  const query = useBuyerOrders(tab);
  const rows = query.data?.pages.flatMap((page) => page.orders) ?? [];
  const home = () => void navigate({ to: "/" });
  const emptyTitle = tab === "active" ? "Активных заказов нет" : "Завершённых заказов нет";
  return (
    <Screen template="list" header={<Header title="Мои заказы" />}>
      <div className="flex flex-wrap gap-2">
        <Chip selected={tab === "active"} onClick={() => setTab("active")}>
          Активные
        </Chip>
        <Chip selected={tab === "completed"} onClick={() => setTab("completed")}>
          Завершённые
        </Chip>
      </div>
      {query.isError && errorKind(query.error) === "access" ? (
        <EmptyState title="Войдите в магазин" action="Войти" onAction={() => setLogin(true)} />
      ) : (
        <QueryBoundary query={query} template="list">
          {() => (
            <>
              {!rows.length && <EmptyState title={emptyTitle} action="К покупкам" onAction={home} />}
              {rows.map((item) => (
                <ListItem
                  key={item.number}
                  title={`Заказ №${item.number}`}
                  subtitle={`${new Date(item.createdAt).toLocaleDateString("ru")} · ${orderStages[item.stage]}`}
                  value={formatMinor(item.totalMinor, item.currency)}
                  onClick={() => void navigate({ to: "/orders/$number", params: { number: String(item.number) } })}
                />
              ))}
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
            </>
          )}
        </QueryBoundary>
      )}
      <ContactSheet
        mode={login ? "telegram" : undefined}
        close={() => {
          setLogin(false);
          void query.refetch();
        }}
      />
    </Screen>
  );
}
