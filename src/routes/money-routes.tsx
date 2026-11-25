import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "./root";
import { day, search } from "./seller-route-search";

const money = lazyRouteComponent(() => import("../features/seller/ui/money/MoneyScreen"), "MoneyScreen");
export const moneyBack = (input: unknown) =>
  typeof input === "string" && /^\/seller\/money(?:\/(?:tasks|operations))?(?:\?|$)/u.test(input) ? input : undefined;
const moneySearch = (
  input: Record<string, unknown>,
): ReturnType<typeof search> & {
  from?: string;
  to?: string;
  group?: "refund" | "topUp" | "review";
  moneyMethod?: "cash" | "transfer" | "unknown";
  q?: string;
  back?: string;
} => ({
  ...search(input),
  from: day(input.from),
  to: day(input.to),
  group: input.group === "refund" || input.group === "topUp" || input.group === "review" ? input.group : undefined,
  moneyMethod:
    input.moneyMethod === "cash" || input.moneyMethod === "transfer" || input.moneyMethod === "unknown"
      ? input.moneyMethod
      : undefined,
  q: typeof input.q === "string" ? input.q.slice(0, 40) : undefined,
  back: moneyBack(input.back),
});
export const moneyRoutes = (
  [
    ["/seller/money", "Деньги", "tab"],
    ["/seller/money/tasks", "Задачи", "push"],
    ["/seller/money/operations", "Операции", "push"],
  ] as const
).map(([path, title, transition]) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path,
    validateSearch: moneySearch,
    staticData: { template: "list", transition, title },
    component: money,
  }),
);
