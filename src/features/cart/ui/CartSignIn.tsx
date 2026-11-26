import { Send } from "lucide-react";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";

export function CartSignIn({ onTelegram, onPhone }: { onTelegram?: () => void; onPhone?: () => void }) {
  return (
    <Card className="text-center">
      <Button full icon={<Send size={16} />} disabled={!onTelegram} onClick={onTelegram}>
        Войти через Telegram
      </Button>
      <button
        type="button"
        className="min-h-8 text-caption text-muted-foreground underline"
        disabled={!onPhone}
        onClick={onPhone}
      >
        У меня нет Telegram
      </button>
    </Card>
  );
}
