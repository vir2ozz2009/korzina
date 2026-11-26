import type { Cart } from "../../../shared/contracts/cart";
import { addMinor, formatMinor } from "../../../shared/money";
import { Button } from "../../../ui/Button";

export function ComparePromoCodes({
  code,
  totalMinor,
  alternative,
  deliveryMinor,
  currency,
  note,
  pending,
  replace,
  keep,
}: {
  code?: string;
  totalMinor: number;
  alternative: NonNullable<NonNullable<Cart["promo"]>["alternative"]>;
  deliveryMinor: number;
  currency: string;
  note?: string;
  pending: boolean;
  replace: () => void;
  keep: () => void;
}) {
  return (
    <>
      <p>
        {code} · {formatMinor(addMinor(totalMinor, deliveryMinor), currency)}
      </p>
      <p>
        {alternative.code} · {formatMinor(addMinor(alternative.totalMinor, deliveryMinor), currency)}
      </p>
      {note && <p>{note}</p>}
      <Button full disabled={alternative.reason === "unknown"} loading={pending} onClick={replace}>
        Заменить код
      </Button>
      <Button full variant="secondary" disabled={pending} onClick={keep}>
        Оставить прежний
      </Button>
    </>
  );
}
