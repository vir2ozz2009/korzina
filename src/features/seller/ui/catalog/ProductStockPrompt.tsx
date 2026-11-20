import { useState } from "react";
import type { SellerStockConflict, SellerStockInput } from "../../../../shared/contracts/seller-catalog";
import { Button } from "../../../../ui/Button";
import { Checkbox } from "../../../../ui/Checkbox";
import { Input } from "../../../../ui/Input";
import { Sheet } from "../../../../ui/Sheet";

export function ProductStockPrompt({
  conflicts,
  initial,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  conflicts: SellerStockConflict[];
  initial: Record<string, number | null>;
  busy: boolean;
  error?: string;
  onConfirm: (edits: SellerStockInput) => void;
  onClose: () => void;
}) {
  const [stock, setStock] = useState<Record<string, string>>(() =>
    Object.fromEntries(conflicts.map((row) => [row.id, String(initial[row.id] ?? row.stock ?? "")])),
  );
  const [unlimited, setUnlimited] = useState<string[]>(
    conflicts.filter((row) => initial[row.id] === null).map((row) => row.id),
  );
  const valid = (id: string) =>
    unlimited.includes(id) || (/^\d+$/u.test(stock[id]) && Number.isSafeInteger(Number(stock[id])));
  return (
    <Sheet
      open
      title="Остаток изменился"
      description="Остальные поля сохранены. Уточните остаток."
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      form
    >
      <div className="space-y-3">
        {conflicts.map((row) => (
          <fieldset key={row.id} className="space-y-2">
            <p className="text-body">
              {row.bought && `Пока вы редактировали, купили ${row.bought} шт. `}
              Сейчас {row.stock === null ? "без лимита" : `осталось ${row.stock} шт.`}
            </p>
            <Input
              label="Новый остаток"
              inputMode="numeric"
              value={stock[row.id]}
              disabled={busy || unlimited.includes(row.id)}
              onChange={(event) => setStock({ ...stock, [row.id]: event.target.value })}
            />
            <Checkbox
              label="Без лимита"
              checked={unlimited.includes(row.id)}
              disabled={busy}
              onChange={(event) =>
                setUnlimited(event.target.checked ? [...unlimited, row.id] : unlimited.filter((id) => id !== row.id))
              }
            />
          </fieldset>
        ))}
        {error && <p role="alert">{error}</p>}
        <Button
          full
          loading={busy}
          disabled={!conflicts.every((row) => valid(row.id))}
          onClick={() =>
            onConfirm(
              conflicts.map((row) => ({
                id: row.id,
                revision: row.revision,
                stock: unlimited.includes(row.id) ? null : Number(stock[row.id]),
              })),
            )
          }
        >
          Сохранить остаток
        </Button>
      </div>
    </Sheet>
  );
}
