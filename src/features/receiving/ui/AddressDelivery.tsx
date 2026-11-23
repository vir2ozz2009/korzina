import { MapPin } from "lucide-react";
import type { ReceivingAvailability } from "../../../shared/contracts/receiving";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { ListItem } from "../../../ui/ListItem";
import { deliveryLabel } from "../delivery-label";

type Check = {
  data: ReceivingAvailability | null | undefined;
  isPending: boolean;
  isError: boolean;
  refetch: () => unknown;
};

export function AddressReviewStatus({ check, currency }: { check: Check; currency: string }) {
  if (check.isPending)
    return (
      <p role="status" className="text-meta">
        Проверяем условия доставки…
      </p>
    );
  if (check.isError)
    return (
      <Card role="alert" className="bg-secondary">
        <p>Не удалось проверить доставку.</p>
        <Button full variant="secondary" onClick={() => void check.refetch()}>
          Повторить проверку
        </Button>
      </Card>
    );
  const result = check.data;
  if (result?.mode !== "delivery") return null;
  if (!result.available)
    return (
      <Card role="status" className="bg-status-danger">
        <p className="text-label text-status-danger-foreground">
          {result.reason === "outside" ? "За пределами зоны доставки" : "Доставка по этому адресу недоступна"}
        </p>
        <p className="text-meta">Укажите другой адрес или проверьте точку на карте.</p>
      </Card>
    );
  return (
    <Card role="status" className="bg-secondary">
      <p className="text-label">Доставка доступна</p>
      <p className="text-meta">{deliveryLabel(result, currency)}</p>
    </Card>
  );
}

export function ManualDeliveryStatus() {
  return (
    <Card role="status" className="bg-secondary">
      <p className="text-meta">
        Проверим адрес. Если точку найти не удастся, магазин уточнит возможность и стоимость доставки.
      </p>
    </Card>
  );
}

export function AddressReview({
  address,
  check,
  currency,
  pending,
  save,
  another,
  pickup,
}: {
  address: string;
  check: Check & { isFetching: boolean };
  currency: string;
  pending: boolean;
  save: () => void;
  another: () => void;
  pickup?: () => void;
}) {
  const result = check.isError ? undefined : check.data;
  return (
    <>
      <ListItem title={address} icon={<MapPin size={20} />} />
      <AddressReviewStatus check={check} currency={currency} />
      {result?.mode === "delivery" &&
        (result.available ? (
          <Button full disabled={check.isFetching} loading={pending} onClick={save}>
            Подтвердить адрес
          </Button>
        ) : (
          <>
            <Button full disabled={pending} onClick={another}>
              Указать другой адрес
            </Button>
            {pickup && (
              <Button full variant="secondary" disabled={pending} onClick={pickup}>
                Выбрать самовывоз
              </Button>
            )}
          </>
        ))}
    </>
  );
}

export function AddressSheetError({ message }: { message: string }) {
  return (
    <p role="alert" className="text-meta text-status-danger-foreground">
      {message}
    </p>
  );
}
