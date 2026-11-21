import { focusManager } from "@tanstack/react-query";
import { telegramLaunch } from "./launch";

interface TelegramApp {
  initData: string;
  viewportHeight: number;
  isExpanded: boolean;
  isActive?: boolean;
  colorScheme: "light" | "dark";
  safeAreaInset?: { top: number; bottom: number; left: number; right: number };
  contentSafeAreaInset?: { top: number; bottom: number; left: number; right: number };
  BackButton: {
    show: () => void;
    hide: () => void;
    onClick: (fn: () => void) => void;
    offClick: (fn: () => void) => void;
  };
  ready: () => void;
  expand: () => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  onEvent: (name: string, fn: () => void) => void;
  offEvent: (name: string, fn: () => void) => void;
}
declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramApp };
  }
}
const telegramApp = () => window.Telegram?.WebApp;

// The SDK is loaded only for a Telegram launch. Normal web visits download nothing.
let loading: Promise<void> | undefined;
export async function loadTelegram() {
  if (!telegramApp() && telegramLaunch) {
    loading ??= new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://telegram.org/js/telegram-web-app.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Telegram SDK unavailable"));
      document.head.appendChild(script);
    }).catch((error) => {
      loading = undefined;
      throw error;
    });
    await loading;
  }
  return telegramApp();
}

export function connectTelegram(app: TelegramApp) {
  const root = document.documentElement;
  const viewport = () => {
    root.style.setProperty("--app-height", `${app.viewportHeight || window.innerHeight}px`);
    for (const edge of ["top", "bottom", "left", "right"] as const) {
      const safe = (app.safeAreaInset?.[edge] ?? 0) + (app.contentSafeAreaInset?.[edge] ?? 0);
      root.style.setProperty(`--safe-${edge}`, `${safe}px`);
      if (edge === "bottom") root.style.setProperty("--floating-bottom", `max(12px, ${safe}px)`);
    }
    focusManager.setFocused(document.visibilityState === "visible" && app.isActive !== false);
  };
  const theme = () => {
    root.dataset.telegramTheme = app.colorScheme;
    app.setHeaderColor(getComputedStyle(root).getPropertyValue("--card").trim());
    app.setBackgroundColor(getComputedStyle(root).getPropertyValue("--background").trim());
  };
  const events = {
    viewportChanged: viewport,
    safeAreaChanged: viewport,
    contentSafeAreaChanged: viewport,
    activated: viewport,
    deactivated: viewport,
    themeChanged: theme,
  };
  for (const [name, fn] of Object.entries(events)) app.onEvent(name, fn);
  document.addEventListener("visibilitychange", viewport);
  viewport();
  theme();
  app.ready();
  app.expand();
  return () => {
    document.removeEventListener("visibilitychange", viewport);
    for (const [name, fn] of Object.entries(events)) app.offEvent(name, fn);
  };
}
