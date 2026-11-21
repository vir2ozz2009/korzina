import { useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { type ReactNode, useRef, useState } from "react";
import { useToast } from "../../../../app/shell/ToastProvider";
import { HttpError } from "../../../../shared/http-error";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { Dialog } from "../../../../ui/Dialog";
import { type SellerRevision, sellerSettingRequest } from "../../settings-api";

export type SettingsFrame = (content: ReactNode, footer?: ReactNode) => ReactNode;
const stringify = JSON.stringify;

export function SettingsEditor<T extends Record<string, unknown>, R extends SellerRevision>({
  store,
  path,
  data,
  select,
  frame,
  children,
  valid = () => true,
  suggestSave = false,
  payload,
}: {
  store: string;
  path: string;
  data: R;
  select: (row: R) => T;
  frame: SettingsFrame;
  children: (value: T, change: (value: T) => void, disabled: boolean) => ReactNode;
  valid?: (value: T) => boolean;
  suggestSave?: boolean;
  payload?: (value: T) => Record<string, unknown>;
}) {
  const client = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<{ value: T; original: T; revision: number }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error>();
  const [conflicts, setConflicts] = useState<(keyof T)[]>([]);
  const [formKey, setFormKey] = useState(0);
  const attempt = useRef<{ body: string; key: string }>(null);
  const original = select(data);
  const value = editing?.value ?? original;
  const dirty = !!editing && stringify(editing.original) !== stringify(value);
  const blocker = useBlocker({
    shouldBlockFn: () => busy || dirty,
    enableBeforeUnload: busy || dirty,
    withResolver: true,
  });
  const conflicted = error instanceof HttpError && error.code === "VERSION_CONFLICT";

  async function save() {
    if ((!dirty && !suggestSave) || busy || conflicts.length || !valid(value)) return;
    const revision = editing?.revision ?? data.revision;
    if (!editing) setEditing({ original, value, revision });
    const body = stringify({ ...(payload?.(value) ?? value), expectedRevision: revision });
    if (attempt.current?.body !== body) attempt.current = { body, key: crypto.randomUUID() };
    setBusy(true);
    setError(undefined);
    try {
      const next = await sellerSettingRequest<R>(store, path, { method: "PUT", ...attempt.current });
      client.setQueryData(["seller-settings", store, path], next);
      setEditing(undefined);
      attempt.current = null;
      toast("Сохранено");
    } catch (error) {
      if (error instanceof Error) setError(error);
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    if (!editing || busy) return;
    setBusy(true);
    try {
      const latest = await sellerSettingRequest<R>(store, path);
      const saved = select(latest);
      const keys = Object.keys(saved) as (keyof T)[];
      const mine = keys.filter((key) => stringify(value[key]) !== stringify(editing.original[key]));
      const both = mine.filter(
        (key) =>
          stringify(saved[key]) !== stringify(editing.original[key]) && stringify(saved[key]) !== stringify(value[key]),
      );
      const next = { ...saved };
      for (const key of mine) next[key] = value[key];
      client.setQueryData(["seller-settings", store, path], latest);
      setEditing({ value: next, original: saved, revision: latest.revision });
      setConflicts(both);
      setError(undefined);
    } catch (error) {
      if (error instanceof Error) setError(error);
    } finally {
      setBusy(false);
    }
  }

  function resolve(key: keyof T, mine: boolean) {
    if (!editing) return;
    if (!mine) setEditing({ ...editing, value: { ...value, [key]: editing.original[key] } });
    setConflicts((current) => current.filter((item) => item !== key));
  }

  return frame(
    <>
      {!data.canWrite && <p className="text-meta">Только просмотр</p>}
      <fieldset key={formKey} disabled={!data.canWrite || busy} className="min-w-0 space-y-3">
        {children(
          value,
          (next) =>
            setEditing({
              original: editing?.original ?? original,
              revision: editing?.revision ?? data.revision,
              value: next,
            }),
          !data.canWrite || busy,
        )}
      </fieldset>
      {error && (
        <Card role="alert">
          <p>{error.message}</p>
          {conflicted && (
            <Button variant="secondary" loading={busy} onClick={() => void refresh()}>
              Обновить
            </Button>
          )}
        </Card>
      )}
      {conflicts.map((field) => (
        <Card key={String(field)}>
          <p>Поле «{String(field)}» изменилось в обеих версиях.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => resolve(field, false)}>
              Сохранённое
            </Button>
            <Button variant="secondary" onClick={() => resolve(field, true)}>
              Моё
            </Button>
          </div>
        </Card>
      ))}
      <Dialog
        open={blocker.status === "blocked" && !busy}
        title="Выйти без сохранения?"
        confirm="Выйти"
        description="Введённые изменения будут потеряны."
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
        onConfirm={() => blocker.proceed?.()}
      />
    </>,
    (dirty || suggestSave) && data.canWrite ? (
      <div className="space-y-2">
        <p className="text-meta">{dirty ? "Несохранённые изменения" : "Сохраните обновлённое расписание"}</p>
        <div className={dirty ? "grid grid-cols-2 gap-2" : "grid"}>
          {dirty && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setEditing(undefined);
                setError(undefined);
                setConflicts([]);
                setFormKey((key) => key + 1);
              }}
            >
              Отменить
            </Button>
          )}
          <Button
            loading={busy}
            disabled={conflicted || !!conflicts.length || !valid(value)}
            onClick={() => void save()}
          >
            Сохранить
          </Button>
        </div>
      </div>
    ) : undefined,
  );
}
