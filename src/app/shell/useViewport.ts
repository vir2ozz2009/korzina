import { useEffect } from "react";

export function useViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => {
      if (!window.Telegram?.WebApp)
        document.documentElement.style.setProperty("--app-height", `${viewport?.height ?? innerHeight}px`);
    };
    resize();
    viewport?.addEventListener("resize", resize);
    return () => viewport?.removeEventListener("resize", resize);
  }, []);
}
