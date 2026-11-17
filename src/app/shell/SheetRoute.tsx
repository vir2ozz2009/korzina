import type { ReactNode } from "react";
import { Sheet } from "../../ui/Sheet";
import { useBack } from "./useBack";

export function SheetRoute({ title, children }: { title: string; children: ReactNode }) {
  const back = useBack();
  return (
    <Sheet
      open
      title={title}
      onOpenChange={(open) => {
        if (!open) back();
      }}
    >
      {children}
    </Sheet>
  );
}
