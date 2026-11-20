import { useState } from "react";
import { Button } from "../../../../ui/Button";
import { Input } from "../../../../ui/Input";
import { Sheet } from "../../../../ui/Sheet";

export function ProductSalePrompt({
  kind,
  onClose,
  onPause,
  onRestore,
}: {
  kind: "pause" | "quantity";
  onClose: () => void;
  onPause: (value: "tomorrow" | "manual") => void;
  onRestore: (stock: string | null) => void;
}) {
  const [stock, setStock] = useState("");
  const [unlimited, setUnlimited] = useState(false);
  const positive = /^\d+$/u.test(stock) && Number.isSafeInteger(Number(stock)) && Number(stock) > 0;
  return (
    <Sheet
      open
      title={kind === "pause" ? "Снять с продажи" : "Сколько есть?"}
      form
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <div className="space-y-2">
        {kind === "pause" ? (
          <>
            <Button full variant="secondary" onClick={() => onPause("tomorrow")}>
              До завтра
            </Button>
            <Button full variant="secondary" onClick={() => onPause("manual")}>
              Пока не верну
            </Button>
          </>
        ) : (
          <>
            <Input
              label="Остаток"
              inputMode="numeric"
              value={stock}
              disabled={unlimited}
              onChange={(event) => setStock(event.target.value)}
            />
            <Button
              variant={unlimited ? "soft" : "secondary"}
              aria-pressed={unlimited}
              onClick={() => setUnlimited(!unlimited)}
            >
              Без лимита
            </Button>
            <Button full disabled={!unlimited && !positive} onClick={() => onRestore(unlimited ? null : stock)}>
              Вернуть в продажу
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
}
