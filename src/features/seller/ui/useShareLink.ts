import { useToast } from "../../../app/shell/ToastProvider";

export function useShareLink() {
  const notify = useToast();
  return async (url: string, native = true) => {
    const systemShare = native && typeof navigator.share === "function";
    try {
      if (systemShare) await navigator.share({ url });
      else {
        await navigator.clipboard.writeText(url);
        notify("Ссылка скопирована");
      }
    } catch (error) {
      if (!(systemShare && error instanceof DOMException && error.name === "AbortError"))
        notify(systemShare ? "Не удалось поделиться ссылкой" : "Не удалось скопировать");
    }
  };
}
