import type { InputHTMLAttributes } from "react";
export function Checkbox({ label, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-label">
      <input {...props} type="checkbox" className="size-5 shrink-0 accent-primary disabled:opacity-40" />
      <span>{label}</span>
    </label>
  );
}
