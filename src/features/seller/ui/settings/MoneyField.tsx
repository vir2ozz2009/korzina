import { useState } from "react";
import { minorInput, parseMinorInput } from "../../../../shared/money";
import { Input } from "../../../../ui/Input";

export function MoneyField({
  amount,
  currency,
  label,
  min = 0,
  change,
}: {
  amount: number;
  currency: string;
  label: string;
  min?: number;
  change: (minor: number) => void;
}) {
  const [draft, setDraft] = useState<{ text: string; minor: number }>();
  const text =
    draft && Object.is(draft.minor, amount) ? draft.text : Number.isFinite(amount) ? minorInput(amount, currency) : "";
  const error = !Number.isSafeInteger(amount) || amount < min || amount > 1_000_000_000_000;
  return (
    <Input
      label={label}
      inputMode="decimal"
      value={text}
      error={error ? "Проверьте сумму" : undefined}
      onChange={(event) => {
        const text = event.target.value;
        const minor = text.trim() ? (parseMinorInput(text, currency) ?? Number.NaN) : 0;
        setDraft({ text, minor });
        change(minor);
      }}
    />
  );
}
