import { useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useToast } from "../../app/shell/ToastProvider";
import { telegramLaunch } from "../../app/telegram/launch";
import { shopKey } from "../../shared/shop-api";
import {
  type ContactLoginMode,
  saveTelegramAttempt,
  type TelegramBrowserAttempt,
} from "../../shared/telegram-browser-attempt";
import { Button } from "../../ui/Button";
import { Sheet } from "../../ui/Sheet";
import { SkeletonBlock } from "../../ui/SkeletonBlock";
import { useContact } from "./api";
import { PhoneForm } from "./PhoneForm";
import { confirmBrowserMerge, finishBrowserLogin, startBrowserLogin } from "./telegram-login";

function LoginContent({
  initial,
  resume,
  close,
  setMergeTitle,
}: {
  initial: ContactLoginMode;
  resume?: TelegramBrowserAttempt;
  close: () => void;
  setMergeTitle: (value: boolean) => void;
}) {
  const [phone, setPhone] = useState(initial === "phone" || (initial !== "link" && telegramLaunch));
  const [opening, setOpening] = useState(false);
  const [attempt, setAttempt] = useState(resume);
  const [merge, setMerge] = useState<string>();
  const [merging, setMerging] = useState(false);
  const [message, setMessage] = useState("");
  const startRequest = useRef<AbortController>(null);
  const finishRequest = useRef<AbortController>(null);
  const contact = useContact(phone);
  const client = useQueryClient();
  const notify = useToast();
  useEffect(() => () => startRequest.current?.abort(), []);

  async function begin() {
    setOpening(true);
    setMessage("");
    const controller = new AbortController();
    startRequest.current = controller;
    try {
      setAttempt(await startBrowserLogin(controller.signal));
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Попробуйте ещё раз");
    } finally {
      if (!controller.signal.aborted) setOpening(false);
    }
  }

  async function complete(signal: AbortSignal) {
    const keys = ["buyer-orders", "order", "favorites", "profile", "receiving", "quote", "purchase-summary"];
    const filters = {
      predicate: ({ queryKey }: { queryKey: readonly unknown[] }) =>
        queryKey[0] === "shop" && queryKey[1] === shopKey && keys.includes(String(queryKey[2])),
    };
    // The old guest cookie may already be revoked while a contact request is still in flight.
    await Promise.all([
      client.cancelQueries(filters),
      client.cancelQueries({ queryKey: ["shop", shopKey, "contact"], exact: true }),
    ]);
    client.removeQueries(filters);
    void client.invalidateQueries({ queryKey: ["shop", shopKey] });
    if (!signal.aborted) {
      notify("Вы вошли через Telegram");
      close();
    }
  }

  const completeLogin = useEffectEvent(complete);

  useEffect(() => {
    if (!attempt || phone) return;
    const request = new AbortController();
    finishRequest.current = request;
    const { signal } = request;
    async function finish(current: TelegramBrowserAttempt) {
      try {
        const result = await finishBrowserLogin(current.exchange, current.expiresAt, signal);
        if (signal.aborted) return;
        if (result === "merge") {
          setMerge(current.exchange);
          setMergeTitle(true);
        } else await completeLogin(signal);
      } catch (error) {
        if (signal.aborted) return;
        saveTelegramAttempt("contact");
        setAttempt(undefined);
        setMessage(error instanceof Error ? error.message : "Попробуйте ещё раз");
      }
    }
    void finish(attempt);
    return () => request.abort();
  }, [attempt, phone, setMergeTitle]);

  if (merge)
    return (
      <div className="space-y-2">
        <p>Перенесём заказы, адреса и избранное в профиль Telegram.</p>
        {message && <p role="alert">{message}</p>}
        <Button
          full
          loading={merging}
          onClick={async () => {
            const signal = finishRequest.current?.signal;
            if (!signal || merging) return;
            setMerging(true);
            setMessage("");
            try {
              await confirmBrowserMerge(merge, signal);
              await complete(signal);
            } catch (error) {
              if (!signal.aborted) setMessage(error instanceof Error ? error.message : "Не удалось объединить профили");
            } finally {
              if (!signal.aborted) setMerging(false);
            }
          }}
        >
          Объединить
        </Button>
        <Button full variant="secondary" disabled={merging} onClick={close}>
          Отмена
        </Button>
      </div>
    );

  if (phone) {
    if (contact.data) return <PhoneForm contact={contact.data} close={close} />;
    if (contact.isPending) return <SkeletonBlock className="h-36" />;
    return (
      <Button full variant="secondary" onClick={() => void contact.refetch()}>
        Повторить загрузку
      </Button>
    );
  }
  return (
    <div className="space-y-2 text-center">
      {message && <p role="alert">Не удалось войти. {message}</p>}
      {attempt ? (
        <>
          <p role="status">Завершите вход в Telegram и вернитесь сюда</p>
          <a
            href={attempt.url}
            target="_blank"
            rel="noreferrer"
            className="text-label text-primary-strong underline"
            onClick={() => saveTelegramAttempt("contact", { ...attempt, mode: initial })}
          >
            Открыть Telegram
          </a>
        </>
      ) : (
        <Button full loading={opening} icon={<Send size={16} />} onClick={() => void begin()}>
          {message ? "Повторить вход" : "Войти через Telegram"}
        </Button>
      )}
      {initial !== "link" && (
        <button
          type="button"
          className="mx-auto block min-h-8 text-caption text-muted-foreground underline"
          onClick={() => {
            startRequest.current?.abort();
            saveTelegramAttempt("contact");
            setPhone(true);
          }}
        >
          У меня нет Telegram
        </button>
      )}
    </div>
  );
}

export function ContactSheet({
  mode,
  resume,
  close,
}: {
  mode: ContactLoginMode;
  resume?: TelegramBrowserAttempt;
  close: () => void;
}) {
  const [merge, setMerge] = useState(false);
  return (
    <Sheet
      form
      title={merge ? "Объединить профили?" : mode === "link" ? "Подключить Telegram" : "Войти в магазин"}
      open
      onOpenChange={(open) => {
        if (!open) {
          setMerge(false);
          close();
        }
      }}
    >
      <LoginContent initial={mode} resume={resume} setMergeTitle={setMerge} close={close} />
    </Sheet>
  );
}
