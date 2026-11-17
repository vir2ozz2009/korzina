import { createContext, type ReactNode, useCallback, useContext, useState } from "react";
import { Toast } from "../../ui/Toast";

const ToastContext = createContext<(message: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const close = useCallback(() => setMessage(""), []);
  return (
    <ToastContext value={setMessage}>
      {children}
      {message && <Toast key={message} message={message} onClose={close} />}
    </ToastContext>
  );
}
export const useToast = () => useContext(ToastContext);
