import { Button } from "../../../ui/Button";
import { StickyFooter } from "../../../ui/StickyFooter";

export function CartContinueButton({
  amount,
  needsAddress,
  needsContact,
  disabled,
  loading,
  onClick,
}: {
  amount: string;
  needsAddress: boolean;
  needsContact: boolean;
  disabled: boolean;
  loading?: boolean;
  onClick?: () => void;
}) {
  const subtitle = needsAddress
    ? "Укажите адрес доставки"
    : needsContact
      ? "Войдите через Telegram или укажите номер"
      : undefined;
  return (
    <StickyFooter floating>
      <Button full size="xl" className="shadow-float" {...{ disabled, loading, subtitle, onClick }}>
        {subtitle ? "К времени и оплате" : `Продолжить · ${amount}`}
      </Button>
    </StickyFooter>
  );
}
