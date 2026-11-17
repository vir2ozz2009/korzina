import { Minus, Plus } from "lucide-react";
import { interactive } from "./interactive";
export interface StepperProps {
  value: number;
  max: number;
  min?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}
export function Stepper({ value, max, min = 1, onChange, disabled }: StepperProps) {
  return (
    <div className="inline-flex h-(--control-sm) items-center rounded-pill bg-input text-body-lg">
      <button
        type="button"
        aria-label="Уменьшить количество"
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={`${interactive} flex min-h-(--control-md) w-11 items-center justify-center rounded-pill`}
      >
        <Minus size={16} />
      </button>
      <output aria-label="Количество" className="min-w-5 text-center">
        {value}
      </output>
      <button
        type="button"
        aria-label="Увеличить количество"
        title={value >= max ? "Больше нет" : undefined}
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className={`${interactive} flex min-h-(--control-md) w-11 items-center justify-center rounded-pill`}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
