import { useQuery } from "@tanstack/react-query";
import { Bike, Store } from "lucide-react";
import { useEffect } from "react";
import { bootstrap } from "../../../app/bootstrap";
import { buyerStorefrontHeaders } from "../../../app/cabinet-storefront";
import type { StorefrontReceiving } from "../../../shared/contracts/receiving-time";
import { calendarDate, formatShopDay } from "../../../shared/datetime";
import { checkResponse } from "../../../shared/http-error";
import { Card } from "../../../ui/Card";

function receivingText(entry: StorefrontReceiving["methods"][number], data: StorefrontReceiving) {
  if (entry.mode === "after_order")
    return entry.method === "delivery"
      ? "Время доставки согласуем после заказа"
      : "Время самовывоза согласуем после заказа";
  if (!entry.date) return "Время уточнит магазин после заказа";
  const day =
    entry.date === data.today
      ? "сегодня"
      : entry.date === calendarDate(data.today, 1)
        ? "завтра"
        : formatShopDay(entry.date, data.timeZone).toLowerCase();
  const label = entry.method === "delivery" ? "Ближайшая доставка" : "Самовывоз";
  return `${label}: ${day}${entry.start ? ` с ${entry.start.replace(/^0/u, "")}` : ""}`;
}

export function OrderingBanner() {
  const slug = bootstrap?.slug;
  const query = useQuery({
    queryKey: ["storefront-receiving", slug],
    enabled: !!slug,
    staleTime: 30_000,
    retry: false,
    queryFn: async ({ signal }): Promise<StorefrontReceiving> => {
      const url = new URL("/api/receiving/next", location.origin);
      if (slug) url.searchParams.set("shop", slug);
      const response = await fetch(url, { signal, headers: buyerStorefrontHeaders() });
      await checkResponse(response);
      return response.json();
    },
  });
  const { data, refetch } = query;
  useEffect(() => {
    if (!data?.refreshAt) return;
    const timer = window.setTimeout(
      () => {
        if (document.visibilityState === "visible") void refetch();
      },
      Math.max(data.refreshAt - Date.now(), 1000),
    );
    return () => window.clearTimeout(timer);
  }, [data?.refreshAt, refetch]);

  const banners = data?.banners ?? bootstrap?.orderBanners ?? [];
  if (!banners.length && !data?.methods?.length) return null;
  return (
    <>
      {!!banners.length && (
        <Card role="status" className="bg-status-warning text-status-warning-foreground">
          {banners.map(({ text }) => text).join(". ")}
        </Card>
      )}
      {!!data?.methods?.length && (
        <Card className="space-y-1.5 py-3">
          {data.methods.map((entry) => {
            const Icon = entry.method === "delivery" ? Bike : Store;
            return (
              <p key={entry.method} className="flex items-start gap-2 text-small">
                <Icon size={17} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
                {receivingText(entry, data)}
              </p>
            );
          })}
        </Card>
      )}
    </>
  );
}
