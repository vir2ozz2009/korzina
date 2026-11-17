import { queryOptions, useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { bootstrap } from "../../app/bootstrap";
import { queryPolicy } from "../../app/query-defaults";
import type { TemplateName } from "../../app/templates/types";

export type Simulation = "loading" | "fast" | "empty" | "error" | undefined;
export function demoSearch(search: Record<string, unknown>): { simulate?: Simulation; filter?: string } {
  const value = search.simulate;
  return {
    simulate: value === "loading" || value === "fast" || value === "empty" || value === "error" ? value : undefined,
    filter: typeof search.filter === "string" ? search.filter : undefined,
  };
}
const demoKeys = {
  screen: (template: TemplateName, simulate?: Simulation) =>
    ["shop", bootstrap?.id ?? "demo", "demo", template, simulate ?? "ready"] as const,
};
export function demoQuery(template: TemplateName, simulate?: Simulation) {
  return queryOptions({
    queryKey: demoKeys.screen(template, simulate),
    ...queryPolicy.catalog,
    retry: false,
    refetchOnMount: false,
    retryOnMount: false,
    queryFn: async ({ signal, client, queryKey }) => {
      if (simulate === "loading" || simulate === "fast")
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, simulate === "fast" ? 40 : 1200);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(signal.reason);
            },
            { once: true },
          );
        });
      if (simulate === "error" && !client.getQueryState(queryKey)?.errorUpdateCount) {
        throw new Error("Демонстрация ошибки соединения");
      }
      return simulate === "empty" ? [] : [{ id: "demo", name: "Томаты на ветке", amountMinor: 18900, unit: "500 г" }];
    },
  });
}
export function useDemo(template: TemplateName) {
  const search = useSearch({ strict: false });
  return useQuery(demoQuery(template, demoSearch(search).simulate));
}
