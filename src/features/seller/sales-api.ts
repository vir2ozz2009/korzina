import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { z } from "zod";
import {
  productSales,
  type SalesPeriod,
  salesDays,
  salesRank,
  salesReport,
  salesSummary,
} from "../../shared/contracts/seller-sales";
import { HttpError } from "../../shared/http-error";
import { sellerHttp } from "./http";

export type SalesSession = { store: string; account: string; timeZone?: string; orders?: boolean };
const sellerSalesKey = ["seller-sales"] as const;
const key = ({ store, account }: SalesSession) => [...sellerSalesKey, store, account] as const;
const options = { retry: false, refetchOnWindowFocus: "always", staleTime: 0 } as const;

async function read<T>(
  store: string,
  path: string,
  schema: z.ZodType<T>,
  params: Record<string, string | undefined>,
  signal: AbortSignal,
) {
  const search = new URLSearchParams({ store });
  for (const [name, value] of Object.entries(params)) if (value !== undefined) search.set(name, value);
  const response = await sellerHttp(`/api/seller/statistics/${path}?${search}`, { signal });
  return schema.parse(await response.json());
}

export function noSalesAccess(error: unknown) {
  return error instanceof HttpError && (error.status === 401 || error.status === 403);
}

export function useSalesSummary(session: SalesSession) {
  return useQuery({
    queryKey: [...key(session), "summary"],
    queryFn: ({ signal }) => read(session.store, "summary", salesSummary, {}, signal),
    ...options,
    gcTime: 0,
  });
}

export function useSalesReport(session: SalesSession, period: Partial<SalesPeriod>, compare: boolean) {
  return useQuery({
    queryKey: [...key(session), "report", period, compare],
    queryFn: ({ signal }) =>
      read(session.store, "report", salesReport, { ...period, compare: compare ? undefined : "0" }, signal),
    ...options,
  });
}

export function useSalesDays(session: SalesSession, period: SalesPeriod, open: boolean) {
  return useQuery({
    queryKey: [...key(session), "days", period],
    queryFn: ({ signal }) => read(session.store, "days", salesDays, period, signal),
    ...options,
    enabled: open,
  });
}

export function useSalesRank(session: SalesSession, period: Partial<SalesPeriod>, full = false) {
  return useInfiniteQuery({
    queryKey: [...key(session), "rank", period],
    queryFn: ({ pageParam, signal }) =>
      read(session.store, "products", salesRank, { ...period, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next,
    ...options,
    refetchOnMount: !full,
  });
}

export function useProductSales(session: SalesSession, id: string, period: Partial<SalesPeriod>, variant?: string) {
  return useQuery({
    queryKey: [...key(session), "product", id, period, variant],
    queryFn: ({ signal }) =>
      read(session.store, `products/${encodeURIComponent(id)}`, productSales, { ...period, variant }, signal),
    ...options,
  });
}
