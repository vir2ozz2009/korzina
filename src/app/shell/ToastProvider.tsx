import { createContext, lazy, type ReactNode, Suspense, useCallback, useContext, useState } from "react";

const Toast = lazy(() => import("../../ui/Toast").then((module) => ({ default: module.Toast })));

const ToastContext = createContext<(message: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const close = useCallback(() => setMessage(""), []);
  return (
    <ToastContext value={setMessage}>
      {children}
      {message && (
        <Suspense
          fallback={
            <span role="status" className="sr-only">
              {message}
            </span>
          }
        >
          <Toast key={message} message={message} onClose={close} />
        </Suspense>
      )}
    </ToastContext>
  );
}
export const useToast = () => useContext(ToastContext);
