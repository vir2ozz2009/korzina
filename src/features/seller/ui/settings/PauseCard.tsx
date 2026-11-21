import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, Clock3, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import { useToast } from "../../../../app/shell/ToastProvider";
import type { ReceivingMethod } from "../../../../shared/contracts/receiving-time";
import type { SaveReceivingPause } from "../../../../shared/contracts/seller-receiving";
import { shopDateTime } from "../../../../shared/datetime";
import { HttpError } from "../../../../shared/http-error";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { Chip } from "../../../../ui/Chip";
import { Sheet } from "../../../../ui/Sheet";
import { StatusPill } from "../../../../ui/StatusPill";
import { Switch } from "../../../../ui/Switch";
import { TextArea } from "../../../../ui/TextArea";
import { type PauseData, sellerSettingRequest, useSellerSetting } from "../../settings-api";

const path = "receiving/pause";
const labels = { pickup: "Самовывоз", delivery: "Доставка" } as const;
const terms = [
  ["hour", "На 1 час"],
  ["day", "До конца дня"],
  ["manual", "Пока не включу"],
] as const;

export function PauseCard({ store }: { store: string }) {
  const query = useSellerSetting<PauseData>(store, path);
  const cache = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const attempt = useRef<{ body: string; key: string }>(null);
  const save = useMutation({
    mutationFn: (input: SaveReceivingPause) => {
      const body = JSON.stringify(input);
      if (attempt.current?.body !== body) attempt.current = { body, key: crypto.randomUUID() };
      return sellerSettingRequest<PauseData>(store, path, { method: "PUT", ...attempt.current });
    },
    onSuccess: (state) => {
      cache.setQueryData(["seller-settings", store, path], state);
      attempt.current = null;
      setOpen(false);
      toast("Сохранено");
    },
    onError: (error) => {
      if (error instanceof HttpError && error.code === "VERSION_CONFLICT") void query.refetch();
    },
  });
  const data = query.data;
  const status = data?.methods ?? [];
  const available = status.filter(({ pause }) => !pause).map(({ method }) => method);
  function resume(method: ReceivingMethod) {
    if (data) save.mutate({ action: "resume", methods: [method], expectedRevision: data.revision });
  }
  return (
    <Card>
      <h2 className="text-title-3">Приём заказов</h2>
      {query.isPending && <p role="status">Загружаем состояние</p>}
      {query.isError && (
        <Button variant="secondary" onClick={() => void query.refetch()}>
          Повторить
        </Button>
      )}
      {data && !status.length && <p className="text-small text-muted-foreground">Способы получения не настроены</p>}
      {status.map(({ method, pause }) => (
        <div className="space-y-2" key={method}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-label">{labels[method]}</span>
            <StatusPill tone={data?.adminPaused ? "danger" : pause ? "warning" : "success"}>
              <span className="inline-flex items-center gap-1">
                {data?.adminPaused ? (
                  <TriangleAlert size={14} />
                ) : pause ? (
                  <Clock3 size={14} />
                ) : (
                  <CircleCheck size={14} />
                )}
                {data?.adminPaused
                  ? "Остановлено администратором"
                  : pause
                    ? `На паузе${pause.until && data ? ` до ${shopDateTime(pause.until, data.timeZone).time}` : ""}`
                    : "Принимаем"}
              </span>
            </StatusPill>
          </div>
          {pause && data?.canWrite && (
            <Button variant="secondary" disabled={save.isPending} onClick={() => resume(method)}>
              Возобновить
            </Button>
          )}
        </div>
      ))}
      {data?.canWrite && available.length > 0 && (
        <Button
          full
          variant="secondary"
          disabled={save.isPending}
          onClick={() => {
            save.reset();
            setOpen(true);
          }}
        >
          Приостановить приём
        </Button>
      )}
      {!open && save.error && <p role="alert">{save.error.message}</p>}
      {open && data && (
        <PauseSheet
          data={data}
          available={available}
          busy={save.isPending}
          error={save.error?.message}
          close={() => setOpen(false)}
          submit={(input) => save.mutate(input)}
        />
      )}
    </Card>
  );
}

function PauseSheet({
  data,
  available,
  busy,
  error,
  close,
  submit,
}: {
  data: PauseData;
  available: ReceivingMethod[];
  busy: boolean;
  error?: string;
  close: () => void;
  submit: (input: SaveReceivingPause) => void;
}) {
  const [scope, setScope] = useState<ReceivingMethod | "all">("all");
  const [term, setTerm] = useState<(typeof terms)[number][0]>("hour");
  const [showBanner, setShowBanner] = useState(true);
  const [message, setMessage] = useState("");
  const methods = scope === "all" ? available : available.filter((method) => method === scope);
  const all = data.methods.every(({ method, pause }) => pause || methods.includes(method));
  const working = available.find((method) => !methods.includes(method));
  const expires =
    term === "hour" ? shopDateTime(Date.now() + 3_600_000, data.timeZone).time : term === "day" ? "00:00" : undefined;
  const title = all
    ? "Магазин временно не принимает заказы"
    : methods[0] === "delivery"
      ? "Доставка временно недоступна"
      : "Самовывоз временно недоступен";
  return (
    <Sheet
      open
      title="Приостановить приём"
      onOpenChange={(next) => {
        if (!next && !busy) close();
      }}
    >
      <p className="text-label">Что остановить?</p>
      <div className="flex flex-wrap gap-2">
        {available.length > 1 && (
          <Chip disabled={busy} selected={scope === "all"} onClick={() => setScope("all")}>
            Всё
          </Chip>
        )}
        {available.map((method) => (
          <Chip
            key={method}
            disabled={busy}
            selected={scope === method || available.length === 1}
            onClick={() => setScope(method)}
          >
            {labels[method]}
          </Chip>
        ))}
      </div>
      <p className="text-label">На сколько?</p>
      <div className="flex flex-wrap gap-2">
        {terms.map(([id, label]) => (
          <Chip key={id} disabled={busy} selected={term === id} onClick={() => setTerm(id)}>
            {label}
          </Chip>
        ))}
      </div>
      <Switch
        label="Показывать плашку на витрине"
        checked={showBanner}
        disabled={busy}
        onChange={(event) => setShowBanner(event.target.checked)}
      />
      {showBanner && (
        <TextArea
          label="Сообщение покупателям"
          placeholder="Необязательно"
          maxLength={140}
          value={message}
          disabled={busy}
          onChange={(event) => setMessage(event.target.value)}
        />
      )}
      <Card>
        <p className="text-small text-muted-foreground">Покупатель увидит:</p>
        <p>
          {showBanner
            ? `${title}${expires ? ` до ${expires}` : ""}${message ? `. ${message}` : ""}${working ? `. ${labels[working]} работает` : ""}`
            : all
              ? "Магазин сейчас не принимает заказы"
              : `${methods[0] ? labels[methods[0]] : ""} · Сейчас недоступно`}
        </p>
      </Card>
      {error && <p role="alert">{error}</p>}
      <Button
        full
        loading={busy}
        disabled={!methods.length}
        onClick={() => submit({ action: "pause", methods, term, showBanner, message, expectedRevision: data.revision })}
      >
        Приостановить
      </Button>
    </Sheet>
  );
}
