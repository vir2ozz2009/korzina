import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { type ShopDraftInput, slugProblem } from "../../../shared/contracts/admin";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { Input } from "../../../ui/Input";
import { useCreateDraft, useSlugAvailability } from "../api";
import { CountryField } from "./RegionFields";

const alphabet = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя";
const transliteration = [
  "a",
  "b",
  "v",
  "g",
  "d",
  "e",
  "yo",
  "zh",
  "z",
  "i",
  "y",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "r",
  "s",
  "t",
  "u",
  "f",
  "kh",
  "ts",
  "ch",
  "sh",
  "shch",
  "",
  "y",
  "",
  "e",
  "yu",
  "ya",
];
function slugFromName(name: string) {
  return [...name.toLowerCase()]
    .map((letter) => {
      const index = alphabet.indexOf(letter);
      return index < 0 ? letter : transliteration[index];
    })
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 30)
    .replace(/-+$/, "");
}

export function CreateDraftForm() {
  const [draft, setDraft] = useState<ShopDraftInput>({ name: "", slug: "", country: "" });
  const [manual, setManual] = useState(false);
  const [checked, setChecked] = useState("");
  const command = useRef<{ input: ShopDraftInput; key: string } | undefined>(undefined);
  const navigate = useNavigate();
  const create = useCreateDraft();
  const invalid = draft.slug ? slugProblem(draft.slug) : undefined;
  const availability = useSlugAvailability(checked, !!checked && checked === draft.slug && !invalid);
  useEffect(() => {
    const timer = window.setTimeout(() => setChecked(draft.slug), 250);
    return () => window.clearTimeout(timer);
  }, [draft.slug]);
  const matched = checked === draft.slug;
  const available = matched && availability.data?.available === true;
  const taken = matched && availability.data?.available === false ? availability.data.message : undefined;
  const change = (patch: Partial<ShopDraftInput>) => {
    setDraft({ ...draft, ...patch });
    command.current = undefined;
    create.reset();
  };
  function submit() {
    if (!available || !draft.name.trim() || !draft.country || create.isPending) return;
    const request = command.current ?? { input: draft, key: crypto.randomUUID() };
    command.current = request;
    create.mutate(request, {
      onSuccess: ({ id }) =>
        void navigate({
          to: "/admin/shops/$id",
          params: { id },
          search: (previous) => ({ shop: previous.shop }),
        }),
    });
  }

  return (
    <Card>
      <form
        className="space-y-3"
        aria-label="Создание магазина"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Input
          label="Название"
          maxLength={120}
          value={draft.name}
          disabled={create.isPending}
          onChange={(event) => {
            const name = event.target.value;
            change(manual ? { name } : { name, slug: slugFromName(name) });
          }}
        />
        <Input
          label="Адрес витрины"
          value={draft.slug}
          maxLength={30}
          autoCapitalize="none"
          spellCheck={false}
          disabled={create.isPending}
          error={invalid?.message ?? taken}
          hint={
            available
              ? "Адрес свободен"
              : draft.slug && !invalid && !taken && !availability.isError
                ? "Проверяем адрес…"
                : undefined
          }
          onChange={(event) => {
            setManual(true);
            change({ slug: event.target.value });
          }}
        />
        {matched && availability.isError && (
          <Button variant="secondary" onClick={() => void availability.refetch()}>
            Повторить проверку адреса
          </Button>
        )}
        <CountryField country={draft.country} showDefaults change={(country) => change({ country })} />
        {create.error && <p role="alert">{create.error.message}</p>}
        <Button
          full
          type="submit"
          loading={create.isPending}
          disabled={!available || !draft.name.trim() || !draft.country}
        >
          Создать
        </Button>
      </form>
    </Card>
  );
}
