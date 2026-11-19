import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import type { ShopDraftInput } from "../../../shared/contracts/admin";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { Input } from "../../../ui/Input";
import { useCreateDraft } from "../api";
import { CountryField } from "./RegionFields";
import { useSlugCheck } from "./useSlugCheck";

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
  const command = useRef<{ input: ShopDraftInput; key: string } | undefined>(undefined);
  const navigate = useNavigate();
  const create = useCreateDraft();
  const check = useSlugCheck(draft.slug);
  const change = (patch: Partial<ShopDraftInput>) => {
    setDraft({ ...draft, ...patch });
    command.current = undefined;
    create.reset();
  };
  function submit() {
    if (!check.available || !draft.name.trim() || !draft.country || create.isPending) return;
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
          error={check.message}
          hint={check.hint}
          onChange={(event) => {
            setManual(true);
            change({ slug: event.target.value });
          }}
        />
        {check.failed && (
          <Button variant="secondary" onClick={check.retry}>
            Повторить проверку адреса
          </Button>
        )}
        <CountryField country={draft.country} showDefaults change={(country) => change({ country })} />
        {create.error && <p role="alert">{create.error.message}</p>}
        <Button
          full
          type="submit"
          loading={create.isPending}
          disabled={!check.available || !draft.name.trim() || !draft.country}
        >
          Создать
        </Button>
      </form>
    </Card>
  );
}
