import { useBlocker } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "../../../../ui/Button";
import { Dialog } from "../../../../ui/Dialog";
import { useCatalogNav } from "./navigation";

export type CatalogFrame = (children: ReactNode, footer?: ReactNode) => ReactNode;
export function CatalogEditorFrame({
  store,
  fallback,
  frame,
  dirty,
  busy,
  onSave,
  children,
}: {
  store: string;
  fallback: string;
  frame: CatalogFrame;
  dirty: boolean;
  busy: boolean;
  onSave: () => void;
  children: ReactNode;
}) {
  const nav = useCatalogNav(store);
  const blocker = useBlocker({ enableBeforeUnload: dirty, shouldBlockFn: () => dirty, withResolver: true });
  return frame(
    <>
      {children}
      <Dialog
        open={blocker.status === "blocked"}
        title="Выйти без сохранения?"
        description="Введённые изменения будут потеряны."
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
        confirm="Выйти"
        onConfirm={() => blocker.proceed?.()}
      />
    </>,
    dirty ? (
      <div className="space-y-2">
        <p className="text-meta">Несохранённые изменения</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => nav.leave(fallback)}>
            Отменить
          </Button>
          <Button loading={busy} onClick={onSave}>
            Сохранить
          </Button>
        </div>
      </div>
    ) : undefined,
  );
}
