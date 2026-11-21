import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { QueryBoundary } from "../../../app/shell/QueryBoundary";
import { useToast } from "../../../app/shell/ToastProvider";
import { api } from "../../../shared/api";
import type { ReadinessItem } from "../../../shared/contracts/launch";
import { checkResponse, errorKind } from "../../../shared/http-error";
import { commandHeaders } from "../../../shared/shop-api";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { Dialog } from "../../../ui/Dialog";
import { ListItem } from "../../../ui/ListItem";
import { sellerSessionHeaders } from "../api";

const settings = {
  name: ["Данные магазина", "/seller/shop-data"],
  product: ["Товары", "/seller/products"],
  receiving: ["Доставка и самовывоз", "/seller/receiving"],
  payment: ["Оплата", "/seller/payments"],
} as const satisfies Record<ReadinessItem["key"], readonly [string, string]>;

export function LaunchReadiness({ store }: { store: string }) {
  const router = useRouter();
  const cache = useQueryClient();
  const notify = useToast();
  const [confirmed, setConfirmed] = useState(false);
  const previous = useRef<{ revision: string; key: string } | undefined>(undefined);
  const query = useQuery({
    queryKey: ["seller", "launch", store],
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await api.api.seller.launch.$get(
        { query: { store } },
        {
          init: { signal },
          headers: sellerSessionHeaders(),
        },
      );
      await checkResponse(response);
      return response.json();
    },
  });
  const release = useMutation({
    mutationFn: async (revision: string) => {
      const key = previous.current?.revision === revision ? previous.current.key : crypto.randomUUID();
      previous.current = { revision, key };
      const response = await api.api.seller.launch.open.$post(
        { query: { store }, json: { revision } },
        {
          headers: { ...sellerSessionHeaders(), ...commandHeaders(key) },
        },
      );
      await checkResponse(response);
    },
    onSuccess: async () => {
      setConfirmed(false);
      notify("Магазин открыт");
      await cache.invalidateQueries({ queryKey: ["seller", "cabinet"] });
    },
    onError: async (error) => {
      if (errorKind(error) === "retry") return;
      previous.current = undefined;
      setConfirmed(false);
      await query.refetch();
    },
  });
  const unknown = release.error && errorKind(release.error) === "retry";
  return (
    <Card>
      <h2 className="text-title-3">Готовность магазина</h2>
      <QueryBoundary query={query} template="form">
        {({ items, revision, status }) => (
          <>
            {items.map(({ key, ready }) => {
              const [label, path] = settings[key];
              const url = new URL(path, location.origin);
              url.searchParams.set("store", store);
              return (
                <ListItem
                  key={key}
                  title={label}
                  value={ready ? "Готово" : "Нужно настроить"}
                  onClick={() => void router.navigate({ href: url.pathname + url.search })}
                />
              );
            })}
            <Button
              full
              disabled={status !== "draft" || items.some(({ ready }) => !ready)}
              onClick={() => setConfirmed(true)}
            >
              Открыть магазин
            </Button>
            {release.error && !unknown && <p role="alert">{release.error.message}</p>}
            <Dialog
              open={confirmed}
              onOpenChange={(open) => {
                if (!release.isPending) setConfirmed(open);
              }}
              title={unknown ? "Проверяем, открылся ли магазин" : "Открыть магазин?"}
              description="Покупатели смогут оформить заказ"
              confirm={unknown ? "Проверить статус" : "Открыть магазин"}
              loading={release.isPending}
              onConfirm={() => {
                if (!unknown) release.mutate(revision);
                else
                  void query.refetch().then(({ data }) => {
                    if (!data) return;
                    if (data.status === "active") {
                      setConfirmed(false);
                      notify("Магазин открыт");
                      void cache.invalidateQueries({ queryKey: ["seller", "cabinet"] });
                    } else release.reset();
                  });
              }}
            />
          </>
        )}
      </QueryBoundary>
    </Card>
  );
}
