import { ArrowLeft, X } from "lucide-react";
import { type ReactNode, type RefObject, useId } from "react";
import { Drawer } from "vaul";
import { IconButton } from "./IconButton";
import { useSheetViewport } from "./useSheetViewport";
export function SheetContent({
  open,
  onOpenChange,
  onBack,
  title,
  description,
  returnFocus,
  form = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBack?: () => void;
  title: string;
  description?: string;
  returnFocus?: RefObject<HTMLElement | null>;
  form?: boolean;
  children: ReactNode;
}) {
  const descriptionId = useId();
  const { sheet, scroller } = useSheetViewport(open);
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false} handleOnly={form} noBodyStyles={form}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-foreground/40" />
        <Drawer.Content
          ref={sheet}
          onCloseAutoFocus={(event) => {
            const trigger = returnFocus?.current;
            if (!trigger?.isConnected) return;
            event.preventDefault();
            trigger.focus({ preventScroll: true });
          }}
          data-form-sheet={form || undefined}
          aria-describedby={description ? descriptionId : undefined}
          className="fixed inset-x-0 z-50 mx-auto flex max-w-(--content-max) flex-col rounded-t-xl bg-card px-5 pt-3 pb-[max(1.25rem,var(--safe-bottom))] shadow-sheet outline-none"
        >
          {!form && <div aria-hidden className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-pill bg-border" />}
          <div className="flex shrink-0 items-center justify-between gap-3">
            {onBack && (
              <IconButton aria-label="Назад" onClick={onBack}>
                <ArrowLeft size={22} />
              </IconButton>
            )}
            <Drawer.Title className="min-w-0 flex-1 text-title-3">{title}</Drawer.Title>
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
