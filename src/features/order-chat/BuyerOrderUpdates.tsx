import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { bootstrap } from "../../app/bootstrap";
import { telegramLaunch } from "../../app/telegram/launch";
import { shopApi, shopKey } from "../../shared/shop-api";
import { hasBuyerMarker } from "../../shared/shop-session";
import { useContact } from "../contact";
import { buyerChangeOrdersKey, buyerChatKey, orderRequest } from "../order-changes";

type Signal = { topic: "orders"; id?: number };
export function BuyerOrderUpdates() {
  const client = useQueryClient();
  const contact = useContact(false);
  const account = useQuery({
    queryKey: ["shop", shopKey, "live-session"],
    enabled: hasBuyerMarker() || !!telegramLaunch || !!contact.data?.telegramLinked,
    staleTime: 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await shopApi.api.auth.session.$get({}, { init: { signal } });
      return response.ok ? ((await response.json()).subject ?? null) : null;
    },
  }).data;
  useEffect(() => {
    if (!account) return;
    const name = `korzina:buyer-live:${shopKey}:${account}`;
    const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(name) : undefined;
    let leader: AbortController | undefined;
    let socket: WebSocket | undefined;
    let poll: ReturnType<typeof setInterval> | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let delay = 1_000;
    const refresh = (id?: number) => {
      void client.invalidateQueries({
        queryKey: buyerChangeOrdersKey,
        predicate: ({ queryKey }) => queryKey[2] !== "detail" || id === undefined || queryKey[3] === id,
      });
      void client.invalidateQueries({
        queryKey: buyerChatKey,
        predicate: ({ queryKey }) => queryKey[3] !== "history" || id === undefined || queryKey[4] === id,
      });
    };
    function received(signal: Signal, broadcast: boolean) {
      if (signal?.topic !== "orders") return;
      refresh(signal.id);
      if (broadcast) channel?.postMessage(signal);
    }
    if (channel)
      channel.onmessage = (event: MessageEvent<Signal>) => {
        if (document.visibilityState === "visible") received(event.data, false);
      };
    const startPoll = () => {
      if (poll === undefined) poll = setInterval(() => received({ topic: "orders" }, true), 30_000);
    };
    async function connect(signal: AbortSignal) {
      if (signal.aborted) return;
      try {
        const { ticket }: { ticket: string } = await (
          await orderRequest("orders/live-ticket", undefined, { method: "POST", signal })
        ).json();
        if (signal.aborted) return;
        const url = new URL("/api/orders/live", location.origin);
        const shop = bootstrap?.slug ?? new URLSearchParams(location.search).get("shop");
        if (shop) url.searchParams.set("shop", shop);
        url.searchParams.set("ticket", ticket);
        url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
        const connection = new WebSocket(url);
        socket = connection;
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => connection.close(), 8_000);
          connection.onopen = () => {
            clearTimeout(timeout);
            clearInterval(poll);
            poll = undefined;
            delay = 1_000;
          };
          connection.onmessage = (event: MessageEvent<string>) => {
            try {
              received(JSON.parse(event.data) as Signal, true);
            } catch {
              /* Ignore unknown events. */
            }
          };
          connection.onclose = () => {
            clearTimeout(timeout);
            resolve();
          };
        });
      } catch {
        /* Poll during reconnect. */
      }
      if (signal.aborted) return;
      startPoll();
      reconnect = setTimeout(() => void connect(signal), delay + Math.floor(Math.random() * 250));
      delay = Math.min(delay * 2, 30_000);
    }
    function stop() {
      leader?.abort();
      leader = undefined;
      socket?.close();
      socket = undefined;
      clearInterval(poll);
      clearTimeout(reconnect);
      poll = undefined;
    }
    function visibility() {
      if (document.visibilityState !== "visible") {
        stop();
        return;
      }
      if (leader) return;
      leader = new AbortController();
      const { signal } = leader;
      if (channel && navigator.locks) {
        void navigator.locks
          .request(name, { signal }, async () => {
            await new Promise<void>((finish) => {
              signal.addEventListener("abort", () => finish(), { once: true });
              void connect(signal);
            });
          })
          .catch(() => {
            if (!signal.aborted) startPoll();
          });
      } else void connect(signal);
    }
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      stop();
      channel?.close();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [account, client]);
  return null;
}
