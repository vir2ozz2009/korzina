import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import type {
  SellerGroup,
  SellerGroupKind,
  SellerProduct,
  SellerProductQuery,
  SellerProductRow,
  SellerStockConflict,
} from "../../shared/contracts/seller-catalog";
import { checkResponse } from "../../shared/http-error";
import { commandHeaders } from "../../shared/shop-api";
import { sellerSessionHeaders } from "./api";

const root = (store: string) => ["seller-catalog", store] as const;
type ProductPage = { items: SellerProductRow[]; revision: number; nextCursor: string | null };
export type ProductSave = { product: SellerProduct; conflicts: SellerStockConflict[]; revision: number };
export type BulkResult = { applied: string[]; failed: { id: string; name?: string; code: string }[]; revision: number };

async function request<T>(store: string, path: string, query: Record<string, unknown>, init: RequestInit): Promise<T> {
  const url = new URL(`/api/seller/catalog${path}`, location.origin);
  url.searchParams.set("store", store);
  for (const [key, value] of Object.entries(query))
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  const response = await fetch(url, {
    ...init,
    headers: { ...sellerSessionHeaders(), ...init.headers },
    cache: "no-store",
  });
  await checkResponse(response);
  return response.json();
}

export function useCatalogAccess(store: string) {
  return useQuery({
    queryKey: [...root(store), "access"],
    retry: false,
    queryFn: ({ signal }) => request<{ currency: string; canWrite: boolean }>(store, "/access", {}, { signal }),
  });
}

export function useCatalogProducts(store: string, filters: SellerProductQuery, enabled = true) {
  return useInfiniteQuery({
    queryKey: [...root(store), "products", filters],
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) =>
      request<ProductPage>(store, "/products", { ...filters, cursor: pageParam }, { signal }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function fetchCatalogProduct(store: string, id: string, signal?: AbortSignal) {
  return request<SellerProduct>(store, `/products/${encodeURIComponent(id)}`, {}, { signal });
}
export function useCatalogProduct(store: string, id?: string) {
  return useQuery({
    queryKey: [...root(store), "product", id],
    enabled: !!id,
    queryFn: ({ signal }) => fetchCatalogProduct(store, id ?? "", signal),
  });
}

export function useCatalogGroups(store: string, kind: SellerGroupKind, enabled = true) {
  return useQuery({
    queryKey: [...root(store), kind],
    enabled,
    queryFn: ({ signal }) =>
      request<{ groups: SellerGroup[]; revision: number }>(store, `/groups/${kind}`, {}, { signal }),
  });
}

export function useCatalogCommand<T>(store: string) {
  const queryClient = useQueryClient();
  const attempt = useRef<{ path: string; body: string; key: string } | undefined>(undefined);
  return useMutation({
    mutationFn: ({ path, input }: { path: string; input: unknown }) => {
      const body = JSON.stringify(input);
      if (attempt.current?.body !== body || attempt.current.path !== path)
        attempt.current = { path, body, key: crypto.randomUUID() };
      return request<T>(
        store,
        path,
        {},
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...commandHeaders(attempt.current.key) },
          body,
        },
      );
    },
    onSuccess: () => {
      attempt.current = undefined;
      void queryClient.resetQueries({ queryKey: [...root(store), "products"] });
      void queryClient.invalidateQueries({
        queryKey: root(store),
        predicate: ({ queryKey }) => queryKey[2] !== "products",
      });
      void queryClient.invalidateQueries({ queryKey: ["catalog"] });
    },
  });
}
