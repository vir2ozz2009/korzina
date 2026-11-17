import { useEffect } from "react";
import { Button } from "./Button";
export function Toast({
  message,
  action,
  onAction,
  onClose,
}: {
  message: string;
  action?: string;
  onAction?: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);
  return (
    <div
      role="status"
      className="fixed right-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-3 z-[60] mx-auto flex max-w-(--content-max) items-center justify-between gap-3 rounded-lg bg-inverse px-4 py-3 text-label text-inverse-foreground shadow-float"
    >
      <span>{message}</span>
      {action && (
        <Button variant="inverse" onClick={onAction}>
          {action}
        </Button>
      )}
    </div>
  );
}
