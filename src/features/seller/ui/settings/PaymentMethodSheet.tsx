import { useState } from "react";
import type { PaymentOption } from "../../../../shared/contracts/seller-payments";
import { Button } from "../../../../ui/Button";
import { Input } from "../../../../ui/Input";
import { Sheet } from "../../../../ui/Sheet";
import { Switch } from "../../../../ui/Switch";
import { TextArea } from "../../../../ui/TextArea";
import { BuyerPreview } from "./BuyerPreview";
import { SettingsImage } from "./SettingsImage";

export function MethodSheet({
  store,
  initial,
  close,
  apply,
  remove,
}: {
  store: string;
  initial: PaymentOption;
  close: () => void;
  apply: (option: PaymentOption) => void;
  remove?: () => void;
}) {
  const [option, setOption] = useState(initial);
  const valid =
    option.name.trim() && (!option.enabled || option.instruction?.trim() || option.details?.trim() || option.imageSrc);
  return (
    <Sheet
      open
      title="Способ оплаты"
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Input
        label="Название"
        value={option.name}
        maxLength={80}
        onChange={(event) => setOption({ ...option, name: event.target.value })}
      />
      <Input
        label="Пояснение"
        value={option.description ?? ""}
        maxLength={200}
        onChange={(event) => setOption({ ...option, description: event.target.value })}
      />
      <TextArea
        label="Инструкция"
        value={option.instruction ?? ""}
        maxLength={2000}
        onChange={(event) => setOption({ ...option, instruction: event.target.value })}
      />
      <TextArea
        label="Реквизиты"
        value={option.details ?? ""}
        maxLength={500}
        onChange={(event) => setOption({ ...option, details: event.target.value })}
      />
      <SettingsImage
        store={store}
        label="Картинка для оплаты (QR или реквизиты)"
        purpose="payment_qr"
        src={option.imageSrc}
        change={(image) => setOption((value) => ({ ...value, imageSrc: image?.src, imageId: image?.id ?? null }))}
      />
      <Switch
        label="Просить чек об оплате"
        checked={option.requiresReceipt}
        onChange={(event) => setOption({ ...option, requiresReceipt: event.target.checked })}
      />
      <BuyerPreview>{[option.name, option.description, option.instruction].filter(Boolean).join(" · ")}</BuyerPreview>
      <Button full disabled={!valid} onClick={() => apply(option)}>
        Готово
      </Button>
      {remove && (
        <Button full variant="secondary" onClick={remove}>
          Удалить способ
        </Button>
      )}
    </Sheet>
  );
}
