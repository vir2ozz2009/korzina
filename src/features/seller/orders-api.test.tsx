import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { OrderStage } from "../../shared/contracts/buyer-order";
import type { SellerOrderPage, SellerOrderSummary, SellerTransition } from "../../shared/contracts/seller-order";
import { useSellerOrder, useSellerOrderCommand, useSellerOrderList } from "./orders-api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const store = "test2";
const number = 4;
const cases = [
  { action: "accept", before: "placed", after: "accepted", method: "pickup" },
  { action: "markReady", before: "accepted", after: "ready", method: "pickup" },
  { action: "handOver", before: "ready", after: "handed", method: "delivery" },
  { action: "markPickedUp", before: "ready", after: "completed", method: "pickup" },
  { action: "complete", before: "handed", after: "completed", method: "delivery" },
] as const satisfies readonly {
  action: SellerTransition["action"];
  before: OrderStage;
  after: OrderStage;
  method: SellerOrderSummary["method"];
}[];

it.each(cases)("не возвращает $before после $action, даже если старый поиск отвечает позже", async (scenario) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const oldList = deferred<Response>();
  const oldDetail = deferred<Response>();
  const startedList = deferred<void>();
  const startedDetail = deferred<void>();
  const commandReply = deferred<Response>();
  let listReads = 0;
  let detailReads = 0;

  const summary = (stage: OrderStage, revision: number): SellerOrderSummary => ({
    number,
    stage,
    revision,
    method: scenario.method,
    receivingAt: "",
    createdAt: 0,
    name: null,
    paymentStatus: "confirmed",
    packed: 1,
    lines: 1,
  });
  const page = (stage: OrderStage, rev: number): SellerOrderPage => ({
    rev,
    orders: stage === "completed" ? [] : [summary(stage, rev)],
    money: true,
    timeZone: "UTC",
    newlyPlaced: Number(stage === "placed"),
    active: Number(stage !== "completed"),
    counts: { [stage]: 1 },
  });
  const updated = { number, stage: scenario.after, revision: 11 };
  vi.stubGlobal("fetch", async (input: URL, init: RequestInit) => {
    switch (input.pathname) {
      case "/api/seller/orders":
        expect(input.searchParams.get("search")).toBe("№4");
        if (++listReads > 1) return Response.json(page(scenario.after, 11));
        startedList.resolve();
        return oldList.promise;
      case "/api/seller/orders/4":
        if (++detailReads > 1) return Response.json(updated);
        startedDetail.resolve();
        return oldDetail.promise;
      case "/api/seller/orders/4/transition":
        expect(JSON.parse(String(init.body))).toEqual({ action: scenario.action, expectedRevision: 10 });
        return commandReply.promise;
      default:
        throw new Error(`Неожиданный запрос: ${input.pathname}`);
    }
  });

  const { result } = renderHook(
    () => ({
      list: useSellerOrderList(store, { tab: "active", search: "№4" }, true).list,
      detail: useSellerOrder(store, number),
      command: useSellerOrderCommand(store),
    }),
    { wrapper },
  );
  await Promise.all([startedList.promise, startedDetail.promise]);
  await act(async () => {
    const done = result.current.command.mutateAsync({
      number,
      command: { action: scenario.action, expectedRevision: 10 },
      key: "transition",
    });
    commandReply.resolve(Response.json(updated));
    await done;
  });

  // Responses already on their way may still settle even after the read is cancelled.
  await act(async () => {
    oldList.resolve(Response.json(page(scenario.before, 10)));
    oldDetail.resolve(Response.json({ number, stage: scenario.before, revision: 10 }));
  });

  await waitFor(() => {
    expect(result.current.list.data).toEqual(page(scenario.after, 11));
    expect(result.current.detail.data).toMatchObject(updated);
  });
  expect(client.getQueryData(["seller-orders", store, "badge"])).toEqual({ rev: 11, count: 0 });
});
