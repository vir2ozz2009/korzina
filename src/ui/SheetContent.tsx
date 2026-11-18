import { X } from "lucide-react";
import { type ReactNode, useId } from "react";
import { Drawer } from "vaul";
import { IconButton } from "./IconButton";
import { useSheetViewport } from "./useSheetViewport";
export function SheetContent({
  open,
  onOpenChange,
  title,
  description,
  form = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  form?: boolean;
  children: ReactNode;
}) {
  const descriptionId = useId();
  const { sheet, scroller } = useSheetViewport(form && open);
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={!form} handleOnly={form} noBodyStyles={form}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-foreground/40" />
        <Drawer.Content
          ref={sheet}
          data-form-sheet={form || undefined}
          aria-describedby={description ? descriptionId : undefined}
          className="fixed inset-x-0 bottom-[var(--sheet-viewport-bottom,0)] z-50 mx-auto flex max-h-[min(90dvh,calc(var(--sheet-viewport-height,100dvh)-0.5rem))] max-w-(--content-max) flex-col rounded-t-xl bg-card px-5 pt-3 pb-[max(1.25rem,var(--safe-bottom))] shadow-sheet outline-none"
        >
          {!form && <div aria-hidden className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-pill bg-border" />}
          <div className="flex shrink-0 items-center justify-between gap-3">
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
          <div ref={scroller} className="min-h-0 overflow-y-auto overscroll-contain pt-3">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
