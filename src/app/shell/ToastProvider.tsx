import { createContext, lazy, type ReactNode, Suspense, useCallback, useContext, useState } from "react";

const Toast = lazy(() => import("../../ui/Toast").then((module) => ({ default: module.Toast })));

type ToastAction = { label: string; run: () => void };
type Notice = { message: string; action?: ToastAction };

const ToastContext = createContext<(message: string, action?: ToastAction) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice>();
  const close = useCallback(() => setNotice((current) => (current === notice ? undefined : current)), [notice]);
  const notify = useCallback((message: string, action?: ToastAction) => setNotice({ message, action }), []);
  return (
    <ToastContext value={notify}>
      {children}
      {notice && (
        <Suspense
          fallback={
            <span role="status" className="sr-only">
              {notice.message}
            </span>
          }
        >
          <Toast
            key={notice.message}
            message={notice.message}
            action={notice.action?.label}
            onAction={() => {
              close();
              notice.action?.run();
            }}
            onClose={close}
          />
        </Suspense>
      )}
    </ToastContext>
  );
}
export const useToast = () => useContext(ToastContext);
