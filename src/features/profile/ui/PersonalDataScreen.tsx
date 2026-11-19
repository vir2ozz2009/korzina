import { useBlocker, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Header } from "../../../app/shell/Header";
import { Screen } from "../../../app/shell/Screen";
import { useToast } from "../../../app/shell/ToastProvider";
import { errorKind, HttpError } from "../../../shared/http-error";
import { Button } from "../../../ui/Button";
import { EmptyState } from "../../../ui/EmptyState";
import { Input } from "../../../ui/Input";
import { Sheet } from "../../../ui/Sheet";
import { useEditProfile, useProfile } from "../api";

export function PersonalDataScreen() {
  const profile = useProfile();
  const edit = useEditProfile();
  const navigate = useNavigate();
  const toast = useToast();
  const draft = profile.data;
  const [name, setName] = useState<string>();
  const [phone, setPhone] = useState<string>();
  const attempt = useRef<{ input: string; key: string }>(undefined);
  const dirty = draft && ((name ?? draft.name) !== draft.name || (phone ?? draft.phone) !== draft.phone);
  const leave = useBlocker({
    shouldBlockFn: () => !!dirty,
    enableBeforeUnload: !!dirty,
    withResolver: true,
  });
  const header = <Header title="Мои данные" />;
  if (profile.isError && errorKind(profile.error) === "access")
    return (
      <Screen template="form" header={header}>
        <EmptyState title="Войдите в магазин" action="Войти" onAction={() => void navigate({ to: "/profile" })} />
      </Screen>
    );
  return (
    <Screen template="form" header={header} state={{ query: profile }}>
      {draft && (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (edit.isPending || profile.isError) return;
            const input = { revision: draft.revision, name: name ?? draft.name, phone: phone ?? draft.phone };
            const signature = JSON.stringify(input);
            if (attempt.current?.input !== signature) attempt.current = { input: signature, key: crypto.randomUUID() };
            edit.mutate(
              { ...input, key: attempt.current.key },
              {
                onSuccess: () => {
                  setName(undefined);
                  setPhone(undefined);
                  toast("Сохранено");
                },
                onError: (error) => {
                  if (error instanceof HttpError && error.code === "VERSION_CONFLICT") void profile.refetch();
                  if (error instanceof HttpError && error.code === "VALIDATION")
                    document.getElementById("profile-phone")?.focus();
                },
              },
            );
          }}
        >
          <Input
            label="Имя"
            value={name ?? draft.name}
            maxLength={50}
            autoComplete="name"
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            label="Номер телефона"
            id="profile-phone"
            value={phone ?? draft.phone}
            type="tel"
            maxLength={40}
            autoComplete="tel"
            onChange={(event) => setPhone(event.target.value)}
          />
          {edit.isError && <p role="alert">{edit.error.message || "Не удалось сохранить данные"}</p>}
          {profile.isError && (
            <Button variant="secondary" onClick={() => void profile.refetch()}>
              Повторить
            </Button>
          )}
          <Button full type="submit" loading={edit.isPending} disabled={profile.isError}>
            Сохранить
          </Button>
        </form>
      )}
      {leave.status === "blocked" && (
        <Sheet
          open
          title="Выйти без сохранения?"
          onOpenChange={(open) => {
            if (!open) leave.reset();
          }}
        >
          <div className="space-y-2">
            <Button full variant="secondary" onClick={leave.reset}>
              Отмена
            </Button>
            <Button full disabled={edit.isPending} onClick={leave.proceed}>
              Выйти
            </Button>
          </div>
        </Sheet>
      )}
    </Screen>
  );
}
