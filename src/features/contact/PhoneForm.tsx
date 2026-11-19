import { AsYouType, type CountryCode, getCountryCallingCode } from "libphonenumber-js/min";
import { useId, useState } from "react";
import { Button } from "../../ui/Button";
import { Checkbox } from "../../ui/Checkbox";
import { Input } from "../../ui/Input";
import { type Contact, useSavePhone } from "./api";

const regions = new Intl.DisplayNames(["ru"], { type: "region" });

export function PhoneForm({ contact, close }: { contact: Contact; close: () => void }) {
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
