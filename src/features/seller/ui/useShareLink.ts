import { useState } from "react";
import { useToast } from "../../../app/shell/ToastProvider";

export function useShareLink() {
  const notify = useToast();
  const [manualUrl, setManualUrl] = useState<string>();

  async function share(url: string, copyOnly = false) {
    setManualUrl(undefined);
    if (!copyOnly) {
      const telegram = window.Telegram?.WebApp;
      if (telegram?.initData && telegram.openTelegramLink) {
        const target = new URL("https://t.me/share/url");
        target.searchParams.set("url", url);
        telegram.openTelegramLink(target.href);
        return;
      }
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ url });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
        }
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      notify("Ссылка скопирована");
    } catch {
      setManualUrl(url);
    }
  }

  return { share, manualUrl };
}
