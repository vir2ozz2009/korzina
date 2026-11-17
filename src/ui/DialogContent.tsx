import { useEffect, useId, useRef } from "react";
import { Button } from "./Button";
export function DialogContent({
  open,
  onOpenChange,
  title,
  description,
  confirm = "Удалить",
  onConfirm,
  loading = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirm?: string;
  onConfirm: () => void;
  loading?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onCancel={(event) => {
        event.preventDefault();
        if (!loading) onOpenChange(false);
      }}
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl bg-card p-5 text-foreground shadow-float backdrop:bg-foreground/40"
    >
      <h3 id={`${id}-title`} className="text-title-3">
        {title}
      </h3>
      <p id={`${id}-description`} className="mt-3 text-meta text-muted-foreground">
        {description}
      </p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button variant="secondary" disabled={loading} onClick={() => onOpenChange(false)} autoFocus>
          Отмена
        </Button>
        <Button loading={loading} onClick={onConfirm}>
          {confirm}
        </Button>
      </div>
    </dialog>
  );
}
