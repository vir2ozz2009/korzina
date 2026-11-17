import { useEffect } from "react";
import { telegramApp } from "../telegram/adapter";

export function useViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => {
      if (!telegramApp())
        document.documentElement.style.setProperty("--app-height", `${viewport?.height ?? innerHeight}px`);
    };
    resize();
    viewport?.addEventListener("resize", resize);
    return () => viewport?.removeEventListener("resize", resize);
  }, []);
}
