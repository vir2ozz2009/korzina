import { X } from "lucide-react";
import { type ReactNode, useId } from "react";
import { Drawer } from "vaul";
import { IconButton } from "./IconButton";
export function SheetContent({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const descriptionId = useId();
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-foreground/40" />
        <Drawer.Content
          aria-describedby={description ? descriptionId : undefined}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] max-w-(--content-max) flex-col rounded-t-xl bg-card px-5 pt-3 pb-[max(1.25rem,var(--safe-bottom))] shadow-sheet outline-none"
        >
          <div aria-hidden className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-pill bg-border" />
          <div className="flex items-center justify-between gap-3">
            <Drawer.Title className="text-title-3">{title}</Drawer.Title>
            <Drawer.Close asChild>
              <IconButton aria-label="Закрыть">
                <X size={22} />
              </IconButton>
            </Drawer.Close>
          </div>
          {description && (
            <Drawer.Description id={descriptionId} className="mb-3 text-meta text-muted-foreground">
              {description}
            </Drawer.Description>
          )}
          <div className="overflow-y-auto pt-3">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
