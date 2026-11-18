import { useQueryClient } from "@tanstack/react-query";
import { AsYouType, type CountryCode, getCountryCallingCode } from "libphonenumber-js/min";
import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  const [number, setNumber] = useState(contact.phone ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [touched, setTouched] = useState(false);
  const inputId = "order-phone";
  const phone = new AsYouType(contact.region as CountryCode);
  const formatted = phone.input(number);
  const valid = phone.isValid();
  const save = useSavePhone();
  const invalid = touched && number && !valid ? "Введите номер телефона полностью" : undefined;
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const saved = phone.getNumber()?.number;
        if (confirmed && valid && saved && !save.isPending)
          save.mutate(saved, {
            onSuccess: close,
            onError: () => document.getElementById(inputId)?.focus(),
          });
      }}
    >
      <Input
        id={inputId}
        label={`Номер телефона · ${regions.of(contact.region)} +${getCountryCallingCode(contact.region as CountryCode)}`}
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        maxLength={40}
        value={formatted}
        error={save.error?.message ?? invalid}
        onBlur={() => setTouched(true)}
        onChange={(event) => {
          setNumber(event.target.value);
          save.reset();
        }}
      />
      <Checkbox
        label="Это мой номер телефона"
        checked={confirmed}
        disabled={save.isPending}
        onChange={(event) => setConfirmed(event.target.checked)}
      />
      <Button full type="submit" disabled={!confirmed || !valid} loading={save.isPending}>
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
