import { useNavigate } from "@tanstack/react-router";
import { MapPin, MessageSquare, Store } from "lucide-react";
import { useState } from "react";
import { Header } from "../../../app/shell/Header";
import { Screen } from "../../../app/shell/Screen";
import type { Receiving } from "../../../shared/contracts/receiving";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { Input } from "../../../ui/Input";
import { ListItem } from "../../../ui/ListItem";
import { Sheet } from "../../../ui/Sheet";
import { TextArea } from "../../../ui/TextArea";
import { useReceiving, useSaveReceiving } from "../api";
import { addressFields } from "./AddressFields";
import { ReceivingTime } from "./ReceivingTime";

type Address = Extract<Receiving, { mode: "delivery" }>;

function EditReceiving({
  selection,
  required,
  kind,
  save,
  pending,
}: {
  selection: Receiving;
  required: readonly (keyof typeof addressFields)[];
  kind: "details" | "comment";
  save: (value: Receiving) => Promise<void>;
  pending: boolean;
}) {
  const [draft, setDraft] = useState(selection);
  const [error, setError] = useState("");
  async function submit() {
    setError("");
    try {
      await save(draft);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить");
    }
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!pending) void submit();
      }}
    >
      {kind === "comment" ? (
        <TextArea
          label="Необязательно"
          value={draft.comment ?? ""}
          maxLength={500}
          disabled={pending}
          onChange={(event) => setDraft({ ...draft, comment: event.target.value })}
        />
      ) : (
        draft.mode === "delivery" &&
        (Object.keys(addressFields) as (keyof typeof addressFields)[]).map((field) => (
          <Input
            key={field}
            label={addressFields[field] + (required.includes(field) ? " *" : "")}
            value={draft[field] ?? ""}
            maxLength={80}
            disabled={pending}
            onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
          />
        ))
      )}
      {error && (
        <p role="alert" className="text-meta text-status-danger-foreground">
          {error}
        </p>
      )}
      <Button full type="submit" loading={pending}>
        Сохранить
      </Button>
    </form>
  );
}

function details(address: Address) {
  return [
    address.apartment && `кв. ${address.apartment}`,
    address.entrance && `подъезд ${address.entrance}`,
    address.floor && `этаж ${address.floor}`,
    address.intercom && `домофон ${address.intercom}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function ReceivingScreen() {
  const query = useReceiving();
  const change = useSaveReceiving();
  const navigate = useNavigate();
  const [editor, setEditor] = useState<"details" | "comment">();
  const data = query.data;
  const selection = data?.receiving;
  const address = selection?.mode === "delivery" ? selection : undefined;
  const commentTitle = address ? "Комментарий курьеру" : "Комментарий магазину";
  const back = () => void navigate({ to: "/cart" });
  return (
    <Screen template="checkout" header={<Header title="Получение" />} state={{ query }}>
      {!selection || !data ? (
        <Card>
          <p>Выберите способ получения в корзине</p>
          <Button full onClick={back}>
            В корзину
          </Button>
        </Card>
      ) : (
        <>
          <ListItem
            title={address ? "Доставка" : "Самовывоз"}
            subtitle={address?.address ?? (data.pickup ? `${data.pickup.address} · ${data.pickup.hours}` : undefined)}
            icon={address ? <MapPin size={22} /> : <Store size={22} />}
            value="Изменить"
            onClick={back}
          />
          {address && (
            <ListItem
              title="Уточнить детали адреса"
              subtitle={details(address) || undefined}
              onClick={() => setEditor("details")}
            />
          )}
          <ReceivingTime data={data} />
          <ListItem
            title={commentTitle}
            subtitle={selection.comment}
            icon={<MessageSquare size={22} />}
            onClick={() => setEditor("comment")}
          />
          <Sheet
            title={editor === "details" ? "Детали адреса" : commentTitle}
            open={!!editor}
            onOpenChange={(open) => {
              if (!open) setEditor(undefined);
            }}
          >
            {editor && (
              <EditReceiving
                kind={editor}
                selection={selection}
                required={data.requiredDetails}
                pending={change.isPending}
                save={async (receiving) => {
                  await change.mutateAsync({ receiving, expectedRevision: data.revision });
                  setEditor(undefined);
                }}
              />
            )}
          </Sheet>
        </>
      )}
    </Screen>
  );
}
