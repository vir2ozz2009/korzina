import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Screen } from "../../../../app/shell/Screen";
import { SellerTabs } from "../../../../app/shell/SellerTabs";
import { sellerHistory } from "../../../../app/shell/tab-history";
import type { PromoOffer, PromoTerms } from "../../../../shared/contracts/promo";
import { HttpError } from "../../../../shared/http-error";
import { Card } from "../../../../ui/Card";
import { Header } from "../../../../ui/Header";
import type { useCabinet } from "../../api";
import { useCatalogNav } from "../catalog/navigation";
import { type PromoList as ListData, type PromoCatalog, promoRequest } from "./api";
import { useListFilters } from "./filter-state";
import { PromoActions, PromoCard } from "./PromoCard";
import { PromoExample } from "./PromoExample";
import { PromoList } from "./PromoList";
import { type Action, type Panel, PromoPanel } from "./PromoPanel";
import { PromoPicker } from "./PromoPicker";
import { PromoResults } from "./PromoResults";
import { validatedPromo } from "./validate";

export function PromoWorkspace({
  store,
  account,
  permissions,
  zone,
}: {
  store: string;
  account: string;
  permissions: NonNullable<ReturnType<typeof useCabinet>["data"]>["shops"][number]["permissions"];
  zone: string;
}) {
  const nav = useCatalogNav(store);
  const id = nav.location.pathname.split("/")[3];
  useEffect(() => sellerHistory.visit(nav.location.href), [nav.location.href]);
  const client = useQueryClient();
  const { kind, setKind, status, setStatus, offset, setOffset } = useListFilters(store, account);
  const [chooser, setChooser] = useState<Parameters<typeof PromoPicker>[0]["step"]>();
  const [previousChooser, setPreviousChooser] = useState<typeof chooser>();
  const [panel, setPanel] = useState<Panel>();
  const [revoked, setRevoked] = useState(false);
  const revoke = useCallback(() => setRevoked(true), []);
  const [terms, setTerms] = useState<PromoTerms>();
  const [error, setError] = useState("");
  const operation = useRef<{ key: string; signature: string }>(undefined);
  const base = ["seller-promotions", store, account] as const;
  const filters = { ...(kind && { kind }), ...(status && { status }), offset: String(offset) };
  const list = useQuery({
    queryKey: [...base, "list", filters],
    queryFn: () => promoRequest<ListData>(store, "", filters),
    retry: false,
  });
  const detail = useQuery({
    queryKey: [...base, "offer", id],
    queryFn: () => promoRequest<PromoOffer & { currency?: string; timeZone?: string }>(store, `/${id}`),
    enabled: !!id,
    retry: false,
  });
  const catalog = useQuery({
    queryKey: [...base, "catalog"],
    queryFn: () => promoRequest<PromoCatalog>(store, "/catalog"),
    enabled: !!(chooser || panel || id),
    retry: false,
  });
  const current = id ? detail.data : undefined;
  const currency = current?.currency ?? list.data?.currency ?? "RUB";
  const storeZone = current?.timeZone ?? list.data?.timeZone ?? zone;
  const openProduct = (id: string, variant?: string) =>
    nav.open(`/seller/products/${id}`, { back: nav.location.href, variant });
  const openList = () => (nav.params.get("back") ? nav.leave("/seller/promotions") : nav.open("/seller/promotions"));
  const close = () => {
    setPanel(undefined);
    setTerms(undefined);
    setError("");
  };
  const mutation = useMutation({
    mutationFn: ({ path, key, body }: { path: string; key: string; body: unknown }) =>
      promoRequest<PromoOffer>(store, path, {}, { body, key }),
    networkMode: "always",
    onSuccess: async (offer, { body }) => {
      client.setQueryData([...base, "offer", offer.id], { ...offer, currency });
      await client.invalidateQueries({ queryKey: [...base, "list"] });
      operation.current = undefined;
      close();
      if (id !== offer.id) nav.open(`/seller/promotions/${offer.id}`);
      if (typeof body === "object" && body && "action" in body && body.action === "repeat") {
        setTerms(offer.terms);
        setPanel("form");
      }
    },
    onError: (failure) => {
      if (failure instanceof HttpError && failure.code === "VERSION_CONFLICT" && failure.details) {
        client.setQueryData([...base, "offer", id], failure.details);
        setPanel("summary");
      }
      setError(failure instanceof TypeError ? "Нет связи. Повторите." : failure.message);
    },
  });
  function save(action: Action) {
    if (mutation.isPending) return;
    const body = {
      action,
      revision: current?.revision ?? 0,
      ...((action === "draft" || action === "publish") && { terms }),
    };
    const signature = JSON.stringify(body);
    const key = operation.current?.signature === signature ? operation.current.key : crypto.randomUUID();
    operation.current = { signature, key };
    setError("");
    mutation.mutate({ path: id ? `/${id}` : "", key, body });
  }
  function begin(kind: PromoTerms["kind"], preset?: Partial<PromoTerms>) {
    setTerms({
      kind,
      name: "",
      discount: { type: "percent", value: 0 },
      scope: { type: "all" },
      confirmed: false,
      ...(kind === "code" && { personalLimit: 1 }),
      ...preset,
    });
    setError("");
    setPreviousChooser(chooser);
    setChooser(undefined);
    setPanel("form");
  }
  function start(kind: PromoTerms["kind"], preset?: Partial<PromoTerms>) {
    if (kind === "automatic" && preset?.delivery) {
      void promoRequest<{ offer: PromoOffer | null }>(store, "/delivery-policy")
        .then(({ offer }) => {
          if (offer) {
            setChooser(undefined);
            nav.open(`/seller/promotions/${offer.id}`, { back: nav.location.href });
          } else begin(kind, preset);
        })
        .catch((failure) => setError(failure.message));
    } else begin(kind, preset);
  }
  const deliveryOpened = useRef(false);
  useEffect(() => {
    if (nav.params.get("delivery") && !deliveryOpened.current) {
      deliveryOpened.current = true;
      start("automatic", { delivery: true, name: "Бесплатная доставка от суммы", minimumMinor: 1 });
    }
  });
  function review(next: "summary" | "example", candidate = terms) {
    const parsed = validatedPromo(candidate);
    if (!parsed) {
      setError("Проверьте название, код, скидку, товары и срок.");
      setPanel("form");
      return;
    }
    setTerms(parsed);
    setError("");
    setPanel(next);
  }
  if (
    revoked ||
    [list.error, detail.error, catalog.error, mutation.error].some(
      (failure) => failure instanceof HttpError && [401, 403].includes(failure.status),
    )
  )
    return (
      <Screen template="list" header={<Header title="Продвижение" onBack={openList} />}>
        <Card>Акции недоступны для этого магазина или вашей роли.</Card>
      </Screen>
    );
  if (panel === "example" && terms)
    return (
      <PromoExample
        terms={terms}
        catalog={catalog.data}
        store={store}
        back={() => setPanel("summary")}
        revoke={revoke}
      />
    );
  return (
    <Screen
      template="list"
      header={<Header title={id ? "Акция" : "Продвижение"} headingLevel={1} onBack={id ? openList : undefined} />}
      state={{ query: (id ? detail : list) as typeof list }}
      after={!id && <SellerTabs store={store} permissions={permissions} promotions />}
    >
      {!id && (
        <PromoList
          data={list.data}
          {...{ kind, status, offset, currency, setKind, setStatus, setOffset }}
          create={() => setChooser("goals")}
          open={(id) => nav.open(`/seller/promotions/${id}`, { back: nav.location.href })}
          openProduct={openProduct}
        />
      )}
      {current && (
        <>
          <PromoCard key={`card:${current.id}`} current={current} currency={currency} catalog={catalog.data} />
          <PromoResults
            key={`results:${current.id}`}
            offer={current}
            store={store}
            account={account}
            currency={currency}
            zone={storeZone}
            openOrder={(number) => nav.open(`/seller/orders/${number}`, { back: nav.location.href })}
          />
          <PromoActions
            status={current.status}
            setPanel={setPanel}
            busy={mutation.isPending}
            review={() => review("summary", current.terms)}
            edit={() => {
              setTerms(current.terms);
              setPanel("form");
            }}
            save={() => save("repeat")}
            error={panel ? undefined : error}
          />
        </>
      )}
      <PromoPicker
        step={chooser}
        setStep={setChooser}
        catalog={catalog.data}
        create={start}
        openProduct={openProduct}
      />
      <PromoPanel
        {...{ panel, setPanel, terms, setTerms, current, currency, zone: storeZone, save, review, close, error }}
        onBackForm={
          previousChooser && !current
            ? () => {
                close();
                setChooser(previousChooser);
              }
            : undefined
        }
        catalog={catalog.data}
        busy={mutation.isPending}
      />
    </Screen>
  );
}
