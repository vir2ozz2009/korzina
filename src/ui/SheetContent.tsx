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
  screen = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBack?: () => void;
  title: string;
  description?: string;
  returnFocus?: RefObject<HTMLElement | null>;
  form?: boolean;
  screen?: boolean;
  children: ReactNode;
}) {
  const descriptionId = useId();
  const { sheet, scroller } = useSheetViewport(open);
  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      repositionInputs={false}
      handleOnly={form || screen}
      noBodyStyles={form || screen}
    >
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
          data-form-sheet={form || screen || undefined}
          data-screen-sheet={screen || undefined}
          aria-describedby={description ? descriptionId : undefined}
          className={`fixed inset-x-0 z-50 mx-auto flex max-w-(--content-max) flex-col bg-card outline-none ${screen ? "h-(--sheet-viewport-height,100dvh)" : "rounded-t-xl px-5 pt-3 pb-[max(1.25rem,var(--safe-bottom))] shadow-sheet"}`}
        >
          {!form && !screen && <div aria-hidden className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-pill bg-border" />}
          <div
            className={`flex shrink-0 items-center justify-between gap-3 ${screen ? "min-h-18 px-3 pt-[max(0.75rem,var(--safe-top))] pb-3" : ""}`}
          >
            {onBack && (
              <IconButton aria-label="Назад" onClick={onBack}>
                <ArrowLeft size={22} />
              </IconButton>
            )}
            <Drawer.Title className={`min-w-0 flex-1 ${screen ? "text-title-2" : "text-title-3"}`}>
              {title}
            </Drawer.Title>
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
          <div
            ref={scroller}
            className={`min-h-0 overflow-y-auto overscroll-contain pt-3 ${screen ? "flex-1 bg-background px-3 pb-[max(0.75rem,var(--safe-bottom))]" : ""}`}
          >
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
