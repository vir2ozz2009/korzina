import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";

export function SelectField({
  surface = "muted",
  ...props
}: Omit<ComponentProps<"select">, "className"> & {
  surface?: "muted" | "transparent";
}) {
  return (
    <span className={`relative block min-w-0 rounded-pill ${surface === "muted" ? "bg-input" : ""}`}>
      <select
        {...props}
        className="block min-h-11 w-full min-w-0 appearance-none truncate rounded-pill pl-3.5 pr-9 text-body disabled:opacity-40"
      />
      <ChevronDown
        aria-hidden="true"
        size={16}
        className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2"
      />
    </span>
  );
}
