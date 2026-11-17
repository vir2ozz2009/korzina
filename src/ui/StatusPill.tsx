import type { ReactNode } from "react";

const tones = {
  neutral: "bg-status-neutral text-status-neutral-foreground",
  warning: "bg-status-warning text-status-warning-foreground",
  danger: "bg-status-danger text-status-danger-foreground",
  success: "bg-status-success text-status-success-foreground",
  primary: "bg-primary-soft text-primary-text",
};
export function StatusPill({ tone = "neutral", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return (
    <span className={`inline-flex min-h-6 items-center rounded-pill px-2 text-micro ${tones[tone]}`}>{children}</span>
  );
}
