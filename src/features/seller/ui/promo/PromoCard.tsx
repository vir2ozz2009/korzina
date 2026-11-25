import type { PromoOffer } from "../../../../shared/contracts/promo";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import type { PromoCatalog } from "./api";
import { statusTitle } from "./PromoList";
import type { Panel } from "./PromoPanel";
import { Summary } from "./PromoSummary";

export function PromoCard({
  current,
  currency,
  zone,
  catalog,
  review,
  edit,
  setPanel,
  busy,
  save,
  error,
}: {
  current: PromoOffer;
  currency: string;
  zone: string;
  catalog?: PromoCatalog;
  review: () => void;
  edit: () => void;
  setPanel: (panel: Panel) => void;
  busy: boolean;
  save: () => void;
  error?: string;
}) {
  return (
    <Card className="space-y-3">
      <p>{statusTitle[current.status]}</p>
      <Summary terms={current.terms} currency={currency} zone={zone} catalog={catalog} />
      {current.status === "draft" && (
        <Button full onClick={review}>
          Опубликовать
        </Button>
      )}
      {current.status !== "ended" && (
        <Button full variant="secondary" onClick={edit}>
          Изменить
        </Button>
      )}
      {(current.status === "active" || current.status === "scheduled") && (
        <Button full variant="secondary" onClick={() => setPanel("disable")}>
          Отключить
        </Button>
      )}
      {current.status === "disabled" && (
        <Button full onClick={() => setPanel("enable")}>
          Включить
        </Button>
      )}
      {current.status === "ended" && (
        <Button full loading={busy} onClick={save}>
          Повторить
        </Button>
      )}
      {error && <p role="alert">{error}</p>}
    </Card>
  );
}
