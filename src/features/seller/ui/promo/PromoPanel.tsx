import type { PromoOffer, PromoTerms } from "../../../../shared/contracts/promo";
import { shopDateTime } from "../../../../shared/datetime";
import { Button } from "../../../../ui/Button";
import { Sheet } from "../../../../ui/Sheet";
import type { PromoCatalog } from "./api";
import { PromoExample } from "./PromoExample";
import { PromoForm } from "./PromoForm";
import { Summary } from "./PromoSummary";
export type Panel = "form" | "summary" | "example" | "disable" | "enable" | "discard";
export type Action = "draft" | "publish" | "disable" | "enable" | "repeat";
export function PromoPanel({
  panel,
  onBackForm,
  setPanel,
  terms,
  setTerms,
  current,
  currency,
  zone,
  catalog,
  store,
  busy,
  save,
  review,
  close,
  error,
}: {
  panel?: Panel;
  onBackForm?: () => void;
  setPanel: (next: Panel) => void;
  terms?: PromoTerms;
  setTerms: (terms: PromoTerms) => void;
  current?: PromoOffer;
  currency: string;
  zone: string;
  catalog?: PromoCatalog;
  store: string;
  busy: boolean;
  save: (action: Action) => void;
  review: (next: "summary" | "example", candidate?: PromoTerms) => void;
  close: () => void;
  error: string;
}) {
  const offerTerms = terms ?? current?.terms;
  const future = offerTerms?.fromDate && offerTerms.fromDate > shopDateTime(Date.now(), zone).date;
  const requestClose = () => {
    if (busy) return;
    if (panel === "form" && terms && JSON.stringify(terms) !== JSON.stringify(current?.terms)) setPanel("discard");
    else close();
  };
  return (
    <Sheet
      open={!!panel}
      title={
        panel === "form"
          ? "Условия акции"
          : panel === "example"
            ? "Пример корзины"
            : panel === "enable"
              ? "Включить акцию?"
              : panel === "disable"
                ? "Отключить акцию?"
                : panel === "discard"
                  ? "Сохранить изменения?"
                  : "Сводка акции"
      }
      form
      screen={panel === "form"}
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
      onBack={
        panel === "example" || panel === "summary" || panel === "discard"
          ? () => setPanel("form")
          : panel === "form"
            ? (onBackForm ?? requestClose)
            : undefined
      }
    >
      <div className="space-y-3">
        {panel === "form" && terms && (
          <>
            <PromoForm terms={terms} set={setTerms} currency={currency} catalog={catalog} zone={zone} />
            {current && current.status !== "draft" && (
              <Button full onClick={() => review("summary")}>
                Проверить изменения
              </Button>
            )}
            <Button
              full
              size="lg"
              variant={current && current.status !== "draft" ? "secondary" : "primary"}
              onClick={() => review("example")}
            >
              Проверить на примере
            </Button>
            {(!current || current.status === "draft") && (
              <Button full size="lg" variant="secondary" loading={busy} onClick={() => save("draft")}>
                Сохранить черновик
              </Button>
            )}
          </>
        )}
        {(panel === "summary" || panel === "enable" || panel === "example") && offerTerms && (
          <>
            {panel === "example" && (
              <PromoExample terms={offerTerms} currency={currency} catalog={catalog} store={store} />
            )}
            {current && current.status !== "draft" && panel !== "enable" && (
              <>
                <h3>Было</h3>
                <Summary terms={current.terms} currency={currency} zone={zone} catalog={catalog} />
                <h3>Станет</h3>
              </>
            )}
            <Summary terms={offerTerms} currency={currency} zone={zone} used={current?.used} catalog={catalog} />
            <Button full loading={busy} onClick={() => save(panel === "enable" ? "enable" : "publish")}>
              {panel === "enable"
                ? "Включить"
                : current && current.status !== "draft"
                  ? "Сохранить"
                  : future
                    ? "Запланировать"
                    : "Опубликовать"}
            </Button>
            {panel === "enable" && (
              <Button
                full
                variant="secondary"
                onClick={() => {
                  setTerms(offerTerms);
                  setPanel("form");
                }}
              >
                Изменить условия
              </Button>
            )}
            {panel === "summary" && (
              <Button full variant="secondary" onClick={() => review("example", offerTerms)}>
                Посмотреть пример
              </Button>
            )}
          </>
        )}
        {panel === "disable" && (
          <>
            <Button full loading={busy} onClick={() => save("disable")}>
              Отключить
            </Button>
            <Button full variant="secondary" onClick={close}>
              Оставить
            </Button>
          </>
        )}
        {panel === "discard" && (
          <>
            {(!current || current.status === "draft") && (
              <Button full loading={busy} onClick={() => save("draft")}>
                Сохранить черновик
              </Button>
            )}
            <Button full variant="secondary" onClick={close}>
              Отбросить изменения
            </Button>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </Sheet>
  );
}
