import { useNavigate, useRouterState } from "@tanstack/react-router";
import { sellerHistory } from "../../../../app/shell/tab-history";
import { salesPeriod } from "../../../../shared/contracts/seller-sales";
import { defaultShopTimeZone } from "../../../../shared/datetime";
import { useMoneyOverview } from "../../money-api";
import { SellerOrdersShell } from "../orders/SellerOrdersShell";
import { periodPreset } from "../sales/dates";
import { PeriodPicker } from "../sales/PeriodPicker";
import { MoneyAccessRestricted } from "./MoneyAccessRestricted";
import { MoneyOperations, MoneyTasks } from "./MoneyLists";
import { groups, MoneyOverview, type methods } from "./MoneyOverview";

type Session = { store: string; account: string; timeZone?: string };
type Kind = "review" | "refund" | "topUp";
const routes = {
  overview: "/seller/money",
  tasks: "/seller/money/tasks",
  operations: "/seller/money/operations",
} as const;
export function MoneyScreen() {
  const location = useRouterState({ select: (state) => state.location });
  const view =
    location.pathname === routes.tasks ? "tasks" : location.pathname === routes.operations ? "operations" : "overview";
  const group = location.search.group ?? "review";
  const title =
    view === "tasks"
      ? (groups.find(([kind]) => kind === group)?.[1] ?? "Задачи")
      : view === "operations"
        ? "Операции"
        : "Деньги";
  return (
    <SellerOrdersShell title={title}>
      {(store, allowed, account, timeZone) =>
        allowed ? (
          <MoneyView key={`${store}:${view}`} session={{ store, account, timeZone }} view={view} group={group} />
        ) : (
          <MoneyAccessRestricted />
        )
      }
    </SellerOrdersShell>
  );
}

function MoneyView({ session, view, group }: { session: Session; view: keyof typeof routes; group: Kind }) {
  const location = useRouterState({ select: (state) => state.location });
  const navigate = useNavigate();
  const { store } = session;
  const parsed = salesPeriod.safeParse(location.search);
  const period = parsed.success ? parsed.data : {};
  const timeZone = session.timeZone ?? defaultShopTimeZone;
  const select = (forPath: "/seller/money" | "/seller/money/operations") => (
    <PeriodPicker
      period={parsed.success ? parsed.data : periodPreset(timeZone, 1, false)}
      timeZone={timeZone}
      apply={(dates) =>
        void navigate({ to: forPath, search: (before) => ({ ...before, ...dates, store }), replace: true })
      }
    />
  );
  const back = location.href;
  const open = (number: number, receipt?: boolean) => {
    sellerHistory.savePosition(back, window.scrollY);
    void navigate({
      to: "/seller/orders/$number",
      params: { number: String(number) },
      search: { store, back, action: receipt ? "receipt" : "payment" },
    });
  };
  if (view === "tasks") return <MoneyTasks session={session} group={group} open={open} />;
  if (view === "operations")
    return (
      <MoneyOperations
        session={session}
        period={period}
        choosePeriod={select(routes.operations)}
        open={open}
        method={location.search.moneyMethod}
        term={location.search.q ?? ""}
        search={(q) =>
          void navigate({
            to: routes.operations,
            search: (before) => ({ ...before, store, q: q || undefined }),
            replace: true,
          })
        }
      />
    );
  return (
    <Overview
      session={session}
      period={period}
      choosePeriod={select(routes.overview)}
      tasks={(kind) => {
        sellerHistory.savePosition(back, window.scrollY);
        void navigate({ to: routes.tasks, search: { store, group: kind, back } });
      }}
      operations={(method) => {
        sellerHistory.savePosition(back, window.scrollY);
        void navigate({ to: routes.operations, search: { store, ...period, moneyMethod: method, back } });
      }}
    />
  );
}

function Overview({
  session,
  period,
  choosePeriod,
  tasks,
  operations,
}: {
  session: Session;
  period: Partial<{ from: string; to: string }>;
  choosePeriod: React.ReactNode;
  tasks: (group: Kind) => void;
  operations: (method?: keyof typeof methods) => void;
}) {
  const query = useMoneyOverview(session, period);
  return <MoneyOverview query={query} choosePeriod={choosePeriod} tasks={tasks} operations={operations} />;
}
