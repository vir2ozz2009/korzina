import { type InputHTMLAttributes, useState } from "react";
export function Switch({ label, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string }) {
  const [local, setLocal] = useState(!!props.defaultChecked);
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 text-label">
      <span>{label}</span>
      <span className="relative flex h-11 w-12 shrink-0 items-center">
        <input
          {...props}
          type="checkbox"
          role="switch"
          aria-checked={props.checked ?? local}
          onChange={(event) => {
            setLocal(event.target.checked);
            props.onChange?.(event);
          }}
          className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-default"
        />
        <span className="pointer-events-none absolute inset-x-0 top-2 h-7 rounded-pill bg-secondary peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-ring peer-disabled:opacity-40" />
        <span className="pointer-events-none absolute left-1 size-5 rounded-pill bg-card transition-transform peer-checked:translate-x-5 peer-disabled:opacity-40 motion-reduce:transition-none" />
      </span>
    </label>
  );
}
