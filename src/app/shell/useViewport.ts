import { useEffect, useState } from "react";

export function useViewport() {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => {
      const editing = document.activeElement?.matches(
        'input:not([readonly]):not([type="checkbox"]):not([type="radio"]), textarea:not([readonly]), [contenteditable="true"]',
      );
      setKeyboardOpen(!!editing && !!viewport && viewport.scale === 1 && innerHeight - viewport.height > 150);
      if (!window.Telegram?.WebApp)
        document.documentElement.style.setProperty("--app-height", `${viewport?.height ?? innerHeight}px`);
    };
    resize();
    viewport?.addEventListener("resize", resize);
    document.addEventListener("focusin", resize);
    document.addEventListener("focusout", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      document.removeEventListener("focusin", resize);
      document.removeEventListener("focusout", resize);
    };
  }, []);
  return keyboardOpen;
}
