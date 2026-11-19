import type { InputHTMLAttributes, ReactNode } from "react";
export function Radio({
  label,
  icon,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string; icon?: ReactNode }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-label">
      <input {...props} type="radio" className="size-5 shrink-0 accent-primary disabled:opacity-40" />
      {icon && (
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary">
          {icon}
        </span>
      )}
      <span>{label}</span>
    </label>
  );
}
