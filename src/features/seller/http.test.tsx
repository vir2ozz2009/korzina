import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { ConnectionError, HttpError } from "../../shared/http-error";
import { sellerHttp } from "./http";
import { useMoneyOverview } from "./money-api";
import { sellerReceiptFile, useSellerCalendar, useSellerOrderCommand } from "./orders-api";
import { useSalesReport } from "./sales-api";

const session = vi.hoisted(() => ({ token: "first" }));
vi.mock("./api", () => ({ sellerSessionHeaders: () => ({ Authorization: `Bearer ${session.token}` }) }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function fixture() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

it("CONTEXT-CODE · адаптеры сохраняют разные фильтры/cache и Zod, магазин и сессия меняются на запрос", async () => {
  const calls: { url: URL; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: URL | string, init: RequestInit) => {
    calls.push({ url: new URL(String(url), location.origin), init });
    return Response.json(String(url).includes("/calendar") ? { unchanged: true } : {});
  });
  const { client, wrapper } = fixture();
  for (const store of ["one", "two"]) client.setQueryData(["seller-orders", store, "calendar", ""], { version: 0 });
  session.token = "first";
  const { result, rerender } = renderHook(
    ({ store }) => ({
      orders: useSellerCalendar(store, ""),
      money: useMoneyOverview({ store, account: "account" }, { from: "", to: undefined }),
      sales: useSalesReport({ store, account: "account" }, { from: "", to: undefined }, false),
    }),
    { wrapper, initialProps: { store: "one" } },
  );
  await waitFor(() => {
    expect(result.current.orders.isSuccess).toBe(true);
    expect(result.current.money.isSuccess).toBe(true);
    expect(result.current.sales.error).toBeInstanceOf(ZodError);
  });
  session.token = "second";
  rerender({ store: "two" });
  await waitFor(() => expect(result.current.sales.error).toBeInstanceOf(ZodError));
  await waitFor(() => expect(calls.filter(({ url }) => url.searchParams.get("store") === "two")).toHaveLength(3));
  for (const store of ["one", "two"]) {
    const rows = calls.filter(({ url }) => url.searchParams.get("store") === store);
    expect(rows).toHaveLength(3);
    for (const { init } of rows)
      expect(init.headers).toEqual({ Authorization: `Bearer ${store === "one" ? "first" : "second"}` });
    const orders = rows.find(({ url }) => url.pathname.endsWith("/calendar"));
    expect(orders?.url.searchParams.get("version")).toBe("0");
    expect(orders?.url.searchParams.has("month")).toBe(false);
    expect(orders?.init.cache).toBe("no-store");
    const money = rows.find(({ url }) => url.pathname === "/api/seller/money");
    expect(money?.url.searchParams.has("from")).toBe(false);
    expect(money?.init.cache).toBeUndefined();
    const sales = rows.find(({ url }) => url.pathname.endsWith("/report"));
    expect(sales?.url.searchParams.get("from")).toBe("");
    expect(sales?.url.searchParams.get("compare")).toBe("0");
    expect(sales?.init.cache).toBeUndefined();
  }
});

it("CONTEXT-CODE · файл остаётся blob, abort передаётся, HTTP-ошибка не маскируется", async () => {
  const abort = new AbortController();
  const fetch = vi.fn().mockResolvedValue(new Response("receipt", { headers: { "Content-Type": "application/pdf" } }));
  vi.stubGlobal("fetch", fetch);
  const blob = await sellerReceiptFile("one", 4, "proof", abort.signal);
  expect(await blob.text()).toBe("receipt");
  expect(blob.type).toBe("application/pdf");
  const [url, init] = fetch.mock.calls[0];
  expect(url.pathname).toBe("/api/seller/orders/4/receipts/proof");
  expect(url.searchParams.get("store")).toBe("one");
  expect(init.signal).toBe(abort.signal);
  expect(init.cache).toBe("no-store");
  fetch.mockResolvedValueOnce(Response.json({ error: { code: "FORBIDDEN", message: "Denied" } }, { status: 403 }));
  await expect(sellerReceiptFile("two", 4, "proof", abort.signal)).rejects.toMatchObject({
    status: 403,
    code: "FORBIDDEN",
  });
  fetch.mockImplementationOnce((_url, options: RequestInit) => {
    expect(options.signal).toBe(abort.signal);
    return Promise.reject(new DOMException("Cancelled", "AbortError"));
  });
  abort.abort();
  await expect(sellerReceiptFile("one", 4, "proof", abort.signal)).rejects.toMatchObject({ name: "AbortError" });
});

it("CONTEXT-CODE · команда сохраняет JSON, ключ идемпотентности и no-store", async () => {
  session.token = "command";
  const fetch = vi.fn().mockResolvedValue(Response.json({ number: 4, revision: 1 }));
  vi.stubGlobal("fetch", fetch);
  const { wrapper } = fixture();
  const { result } = renderHook(() => useSellerOrderCommand("one"), { wrapper });
  const command = { action: "accept", expectedRevision: 0 } as const;
  await act(async () => {
    await result.current.mutateAsync({ number: 4, command, key: "same-key" });
  });
  const [url, init] = fetch.mock.calls[0];
  expect(url.searchParams.get("store")).toBe("one");
  expect(init).toMatchObject({
    method: "POST",
    cache: "no-store",
    body: JSON.stringify(command),
    headers: { "Content-Type": "application/json", "Idempotency-Key": "same-key", Authorization: "Bearer command" },
  });
});

it.each([false, true])("CONTEXT-CODE · money оборачивает сетевой TypeError только без abort=%s", async (aborted) => {
  const failure = new TypeError("Network");
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    if (aborted) vi.spyOn(init.signal as AbortSignal, "aborted", "get").mockReturnValue(true);
    throw failure;
  });
  const { wrapper } = fixture();
  const { result } = renderHook(() => useMoneyOverview({ store: "one", account: "account" }, {}), { wrapper });
  await waitFor(() => expect(result.current.isError).toBe(true));
  if (aborted) expect(result.current.error).toBe(failure);
  else {
    expect(result.current.error).toBeInstanceOf(ConnectionError);
    expect(result.current.error).toMatchObject({ cause: failure });
  }
});

it("CONTEXT-CODE · общий транспорт сохраняет Response и не превращает HTTP-ошибку в сетевую", async () => {
  const response = new Response("raw");
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(response)
    .mockResolvedValueOnce(Response.json({ error: { code: "FORBIDDEN", message: "Denied" } }, { status: 403 }));
  vi.stubGlobal("fetch", fetch);
  expect(await sellerHttp("/api/seller/money?store=one")).toBe(response);
  await expect(sellerHttp("/api/seller/statistics/report?store=two")).rejects.toBeInstanceOf(HttpError);
});
