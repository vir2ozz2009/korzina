import { type InputHTMLAttributes, useId } from "react";
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}
const inputClass =
  "min-h-(--control-md) w-full min-w-0 rounded-pill bg-input px-4 text-body focus:text-body-lg disabled:opacity-40 placeholder:text-placeholder aria-invalid:ring-1 aria-invalid:ring-status-danger-foreground";
export function Input({ label, error, hint, id, className = "", ...props }: InputProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={fieldId} className="block text-label">
        {label}
      </label>
      <input
        {...props}
        id={fieldId}
        aria-invalid={!!error}
        aria-describedby={error || hint ? `${fieldId}-hint` : undefined}
        className={`${inputClass} ${className}`}
      />
      {(error || hint) && (
        <p
          id={`${fieldId}-hint`}
          className={`text-small ${error ? "text-status-danger-foreground" : "text-muted-foreground"}`}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
}
