import type { ReactNode } from "react";

export function KitSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl bg-card p-5">
      <h2 className="text-title-2">{title}</h2>
      {children}
    </section>
  );
}
