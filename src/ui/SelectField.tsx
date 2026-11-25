import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";

export function SelectField({
  caption,
  icon,
  surface = "muted",
  className = "",
  ...props
}: Omit<ComponentProps<"select">, "className"> & {
  caption?: string;
  icon?: React.ReactNode;
  surface?: "muted" | "transparent";
  className?: string;
}) {
  return (
    <span className={`relative block min-w-0 rounded-pill ${surface === "muted" ? "bg-input" : ""} ${className}`}>
      {caption && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-label"
        >
          {icon}
          {caption}
        </span>
      )}
      <select
        {...props}
        className={`block min-h-11 w-full min-w-0 appearance-none truncate rounded-pill pr-9 text-body disabled:opacity-40 ${caption ? "text-transparent [&_option]:text-foreground" : "pl-3.5"}`}
      />
      {!caption && (
        <ChevronDown
          aria-hidden="true"
          size={16}
          className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2"
        />
      )}
    </span>
  );
}
