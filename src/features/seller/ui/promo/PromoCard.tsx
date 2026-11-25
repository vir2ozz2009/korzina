import { useState } from "react";
import type { PromoOffer } from "../../../../shared/contracts/promo";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import type { PromoCatalog } from "./api";
import type { Panel } from "./PromoPanel";
import { PromoBadge, personalLimit, promoBenefit, promoConditions, promoPeriod } from "./PromoPresentation";
import { promoScope } from "./PromoSummary";

export function PromoCard({
  current,
  currency,
  catalog,
}: {
  current: PromoOffer;
  currency: string;
  catalog?: PromoCatalog;
}) {
  const { terms, status } = current;
  const [copy, setCopy] = useState("");
  return (
    <Card className="space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 wrap-anywhere text-title-2">{terms.name || "Без названия"}</h2>
        <PromoBadge status={status} />
      </div>
      <div className="flex justify-between gap-3 text-title-3">
        <span>Выгода</span>
        <span className="text-right">{promoBenefit(terms, currency)}</span>
      </div>
      <p className="wrap-anywhere text-body text-muted-foreground">
        {promoConditions(terms, currency, promoScope(terms, catalog))}
      </p>
      <div className="flex justify-between gap-3 text-body">
        <span>Срок</span>
        <span className="text-right">{promoPeriod(terms.fromDate, terms.throughDate)}</span>
      </div>
      {!!terms.totalLimit && (
        <p className="text-small text-muted-foreground">
          Осталось {Math.max(0, terms.totalLimit - current.used)} из {terms.totalLimit}
        </p>
      )}
      {personalLimit(terms) && <p className="text-small text-muted-foreground">{personalLimit(terms)}</p>}
      {terms.kind === "code" && terms.code && status !== "draft" && (
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          <span className="min-w-0 wrap-anywhere text-label">{terms.code}</span>
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(terms.code ?? "");
                setCopy("Код скопирован");
              } catch {
                setCopy("Не удалось скопировать код");
              }
            }}
          >
            Копировать
          </Button>
          {copy && (
            <p className="basis-full text-small" role="status">
              {copy}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

export function PromoActions({
  status,
  review,
  edit,
  setPanel,
  busy,
  save,
  error,
}: {
  status: PromoOffer["status"];
  review: () => void;
  edit: () => void;
  setPanel: (panel: Panel) => void;
  busy: boolean;
  save: () => void;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      {status === "draft" && (
        <Button full onClick={review}>
          Опубликовать
        </Button>
      )}
      {status !== "ended" && (
        <Button full variant="secondary" onClick={edit}>
          Изменить
        </Button>
      )}
      {(status === "active" || status === "scheduled") && (
        <Button full variant="secondary" onClick={() => setPanel("disable")}>
          Отключить
        </Button>
      )}
      {status === "disabled" && (
        <Button full onClick={() => setPanel("enable")}>
          Включить
        </Button>
      )}
      {status === "ended" && (
        <Button full loading={busy} onClick={save}>
          Повторить
        </Button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
