import { useQueryClient } from "@tanstack/react-query";
import { AsYouType, type CountryCode, getCountryCallingCode } from "libphonenumber-js/min";
import { Send } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { telegramLaunch } from "../../app/telegram/launch";
import { shopKey } from "../../shared/shop-api";
import { Button } from "../../ui/Button";
import { Checkbox } from "../../ui/Checkbox";
import { Input } from "../../ui/Input";
import { Sheet } from "../../ui/Sheet";
import { SkeletonBlock } from "../../ui/SkeletonBlock";
import { type Contact, useContact, useSavePhone } from "./api";
import { finishBrowserLogin, startBrowserLogin } from "./telegram-login";

const regions = new Intl.DisplayNames(["ru"], { type: "region" });

function PhoneForm({ contact, close }: { contact: Contact; close: () => void }) {
  const country = contact.region as CountryCode;
  const prefix = `+${getCountryCallingCode(country)}`;
  const [number, setNumber] = useState(contact.phone ?? `${prefix} `);
  const [confirmed, setConfirmed] = useState(false);
  const [touched, setTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const inputId = useId();
  const confirmationId = useId();
  const phone = new AsYouType(country);
  phone.input(number);
  const saved = phone.getNumber()?.number;
  const valid = phone.isValid();
  const save = useSavePhone();
  const invalid = !valid && (submitted || (touched && number.trim() !== prefix));
  const needsConfirmation = submitted && valid && !confirmed;
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (save.isPending) return;
        setSubmitted(true);
        if (!valid || !saved) {
          document.getElementById(inputId)?.focus({ preventScroll: true });
          return;
        }
        if (!confirmed) {
          document.getElementById(confirmationId)?.focus({ preventScroll: true });
          return;
        }
        save.mutate(saved, {
          onSuccess: close,
          onError: () => document.getElementById(inputId)?.focus({ preventScroll: true }),
        });
      }}
    >
      <Input
        id={inputId}
        label={`Номер телефона · ${regions.of(country)}`}
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        maxLength={40}
        value={number}
        hint="Укажите номер с кодом страны. Код можно изменить."
        error={save.error?.message ?? (invalid ? "Введите номер телефона полностью" : undefined)}
        onBlur={() => setTouched(true)}
        onChange={(event) => {
          setNumber(event.target.value);
          save.reset();
        }}
      />
      <Checkbox
        id={confirmationId}
        aria-describedby={`${confirmationId}-hint`}
        aria-invalid={needsConfirmation || undefined}
        label="Это мой номер телефона"
        checked={confirmed}
        disabled={save.isPending}
        onChange={(event) => setConfirmed(event.target.checked)}
      />
      <p
        id={`${confirmationId}-hint`}
        role={needsConfirmation ? "alert" : undefined}
        className={`text-small ${needsConfirmation ? "text-status-danger-foreground" : "text-muted-foreground"}`}
      >
        Подтвердите номер галочкой, чтобы продолжить.
      </p>
      <Button full type="submit" loading={save.isPending}>
        Сохранить и продолжить
      </Button>
    </form>
  );
}

function LoginContent({ initial, close }: { initial: "telegram" | "phone"; close: () => void }) {
  const [phone, setPhone] = useState(initial === "phone" || telegramLaunch);
  const [state, setState] = useState<"idle" | "opening" | "waiting" | "error">("idle");
  const [url, setUrl] = useState<string>();
  const [message, setMessage] = useState("");
  const login = useRef<AbortController>(null);
  const contact = useContact(phone);
  const client = useQueryClient();
  useEffect(() => () => login.current?.abort(), []);

  async function begin() {
    setState("opening");
    setUrl(undefined);
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    const controller = new AbortController();
    login.current = controller;
    try {
      const attempt = await startBrowserLogin(controller.signal);
      setUrl(attempt.url);
      if (popup && !popup.closed) popup.location.replace(attempt.url);
      setState("waiting");
      await finishBrowserLogin(attempt.exchange, attempt.expiresAt, controller.signal);
      await client.invalidateQueries({ queryKey: ["shop", shopKey] });
      if (!controller.signal.aborted) close();
    } catch (error) {
      if (!controller.signal.aborted) {
        if (popup && !popup.closed) popup.close();
        setMessage(error instanceof Error ? error.message : "Попробуйте ещё раз");
        setState("error");
      }
    }
  }

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
      {state === "error" && <p role="alert">Не удалось войти. {message}</p>}
      {state === "waiting" ? (
        <>
          <p role="status">Завершите вход в Telegram и вернитесь сюда</p>
          <a href={url} target="_blank" rel="noreferrer" className="text-label text-primary-strong underline">
            Открыть Telegram
          </a>
        </>
      ) : (
        <Button full loading={state === "opening"} icon={<Send size={16} />} onClick={() => void begin()}>
          {state === "error" ? "Повторить вход" : "Войти через Telegram"}
        </Button>
      )}
      <button
        type="button"
        className="mx-auto block min-h-8 text-caption text-muted-foreground underline"
        onClick={() => {
          login.current?.abort();
          setPhone(true);
        }}
      >
        У меня нет Telegram
      </button>
    </div>
  );
}

export function ContactSheet({ mode, close }: { mode: "telegram" | "phone" | undefined; close: () => void }) {
  return (
    <Sheet
      form
      title="Войти в магазин"
      open={!!mode}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      {mode && <LoginContent initial={mode} close={close} />}
    </Sheet>
  );
}
