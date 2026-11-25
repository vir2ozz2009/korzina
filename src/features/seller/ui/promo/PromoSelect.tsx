import { type ComponentProps, useId } from "react";
import { SelectField } from "../../../../ui/SelectField";

export function PromoSelect({
  label,
  inline = false,
  ...props
}: ComponentProps<typeof SelectField> & { label: string; inline?: boolean }) {
  const id = useId();
  return (
    <div className={inline ? "grid min-h-11 grid-cols-[auto_minmax(0,1fr)] items-center gap-2" : "space-y-1.5"}>
      <label htmlFor={id} className="block text-label">
        {label}
      </label>
      <SelectField surface={inline ? "transparent" : undefined} {...props} id={id} />
    </div>
  );
}
