import { Button } from "../../../ui/Button";
import { StickyFooter } from "../../../ui/StickyFooter";

export function CartContinueButton({
  amount,
  subtitle,
  disabled,
  loading,
  onClick,
}: {
  amount: string;
  subtitle?: string;
  disabled: boolean;
  loading?: boolean;
  onClick?: () => void;
}) {
  return (
    <StickyFooter floating>
      <Button full size="xl" className="shadow-float" {...{ disabled, loading, subtitle, onClick }}>
        {subtitle ? "К времени и оплате" : `Продолжить · ${amount}`}
      </Button>
    </StickyFooter>
  );
}
