import { useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { HttpError } from "../../shared/http-error";
import { useCabinet } from "./api";
import { invalidateSellerOrders, sellerOrdersSocket } from "./orders-api";

type OrderUpdate = { topic: "orders"; cursor: number; id?: number };
type Update = OrderUpdate | { topic: "sales" };

export function SellerOrderUpdates() {
  const store = useRouterState({ select: (state) => state.location.search.store });
  const cabinet = useCabinet(store);
  const current = cabinet.isError ? undefined : cabinet.data?.current;
  const orders = current?.permissions?.includes("orders") ?? false;
  const payments = current?.permissions?.includes("payments") ?? false;
  useSellerOrdersLive(orders || payments ? (current?.slug ?? "") : "", cabinet.data?.telegramId, orders, payments);
  return null;
}

function useSellerOrdersLive(store: string, account: string | undefined, orders: boolean, payments: boolean) {
  const client = useQueryClient();
  useEffect(() => {
    if (!store || !account) return;
    const name = `korzina:orders:${store}:${account}`;
    const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(name) : undefined;
    let session: AbortController | undefined;
    let socket: WebSocket | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;

    const sales = { queryKey: ["seller-sales", store] };
    const refresh = (data?: OrderUpdate) => {
      if (payments) void client.invalidateQueries(sales);
      if (!orders) return;
      void invalidateSellerOrders(client, store, data?.id, data?.cursor);
      void client.invalidateQueries({
        queryKey: ["seller-chat", store],
        predicate: ({ queryKey }) => queryKey[2] !== "history" || data?.id === undefined || queryKey[3] === data.id,
      });
    };
    const refreshAccess = () => {
      if (!payments) return;
      void client.resetQueries(sales);
      void client.invalidateQueries({ queryKey: ["seller", "cabinet"] });
    };
    const receive = (data: Update, broadcast: boolean) => {
      if (data?.topic === "orders" && Number.isSafeInteger(data.cursor)) refresh(data);
      else if (data?.topic === "sales" && payments) void client.invalidateQueries(sales);
      else return;
      if (broadcast) channel?.postMessage(data);
    };
    channel?.addEventListener("message", (event: MessageEvent<Update | "refresh" | "access">) => {
      if (event.data === "access") refreshAccess();
      else if (document.visibilityState === "visible") {
        if (event.data === "refresh") refresh();
        else receive(event.data, false);
      }
    });

    const startPolling = () => {
      if (!poll && document.visibilityState === "visible")
        poll = setInterval(() => {
          refresh();
          channel?.postMessage("refresh");
        }, 60_000);
    };
    async function lead(signal: AbortSignal) {
      try {
        const connection = await sellerOrdersSocket(store, signal);
        if (signal.aborted) {
          connection.close();
          return;
        }
        socket = connection;
        await new Promise<void>((finish) => {
          const untilOpen = setTimeout(() => connection.close(), 8_000);
          connection.addEventListener("open", () => clearTimeout(untilOpen), { once: true });
          connection.addEventListener("message", (event) => {
            try {
              receive(JSON.parse(event.data), true);
            } catch {
              /* Ignore messages other than order signals. */
            }
          });
          connection.addEventListener(
            "close",
            (event) => {
              clearTimeout(untilOpen);
              if (event.code === 1008 && !signal.aborted) {
                refreshAccess();
                channel?.postMessage("access");
              }
              finish();
            },
            { once: true },
          );
        });
      } catch (error) {
        if (!signal.aborted && error instanceof HttpError && (error.status === 401 || error.status === 403)) {
          refreshAccess();
          channel?.postMessage("access");
          return;
        }
        // A failed connection uses a visible-only fallback.
      }
      if (!signal.aborted) startPolling();
    }

    function stop() {
      session?.abort();
      session = undefined;
      socket?.close();
      socket = undefined;
      if (poll) clearInterval(poll);
      poll = undefined;
    }
    function visibility() {
      if (document.visibilityState !== "visible") {
        stop();
        return;
      }
      if (session) return;
      session = new AbortController();
      const { signal } = session;
      if (navigator.locks && channel) {
        void navigator.locks
          .request(name, { signal }, () => lead(signal))
          .catch(() => {
            if (!signal.aborted) startPolling();
          });
      } else void lead(signal);
    }
    document.addEventListener("visibilitychange", visibility);
    visibility();
    return () => {
      stop();
      channel?.close();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [account, client, orders, payments, store]);
}
