import { useState } from "react";
import type { Point } from "../../../../shared/contracts/receiving";
import { Button } from "../../../../ui/Button";
import { Input } from "../../../../ui/Input";
import { ListItem } from "../../../../ui/ListItem";
import { Sheet } from "../../../../ui/Sheet";
import { sellerSettingRequest } from "../../settings-api";

type City = { name: string; center: Point; boundary: Point[] | null };
export function CitySheet({
  store,
  choose,
  close,
}: {
  store: string;
  choose: (city: City) => void;
  close: () => void;
}) {
  const [city, setCity] = useState("");
  const [results, setResults] = useState<City[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  async function search() {
    setState("loading");
    try {
      setResults(
        (
          await sellerSettingRequest<{ results: City[] }>(store, "receiving/city", {
            method: "POST",
            body: JSON.stringify({ city }),
          })
        ).results,
      );
      setState("idle");
    } catch {
      setState("error");
    }
  }
  return (
    <Sheet
      open
      title="Выбрать город"
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Input label="Город" value={city} onChange={(event) => setCity(event.target.value)} />
      <Button full loading={state === "loading"} disabled={city.trim().length < 2} onClick={() => void search()}>
        Найти
      </Button>
      {state === "error" && <p role="alert">Не удалось найти город. Повторите поиск.</p>}
      {results.map((item) => (
        <ListItem key={item.name} title={item.name} onClick={() => choose(item)} />
      ))}
    </Sheet>
  );
}
