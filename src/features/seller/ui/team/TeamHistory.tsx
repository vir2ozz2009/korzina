import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { QueryBoundary } from "../../../../app/shell/QueryBoundary";
import { Button } from "../../../../ui/Button";
import { EmptyState } from "../../../../ui/EmptyState";
import { ListItem } from "../../../../ui/ListItem";
import { Select } from "../../../../ui/Select";
import { Sheet } from "../../../../ui/Sheet";
import { type Audit, roleName, teamKey, teamRequest } from "./team-api";

const actionName: Record<string, string> = {
  "team.invite_created": "Создано приглашение",
  "team.invite_revoked": "Приглашение отозвано",
  "team.invite_accepted": "Приглашение принято",
  "team.access_updated": "Изменены права",
  "team.access_revoked": "Доступ отозван",
  "team.notifications_updated": "Изменены уведомления",
  "shop.status": "Изменён статус магазина",
};
const sectionName = { team: "Команда", shop: "Магазин", owner: "Владелец", bot: "Бот" };
const dateTime = new Intl.DateTimeFormat("ru", { dateStyle: "short", timeStyle: "short" });
const statusName = { draft: "Черновик", active: "Открыт", paused: "Пауза" };

export function TeamHistory({ store }: { store: string }) {
  const [filters, setFilters] = useState({ section: "", date: "", actor: "" });
  const [draft, setDraft] = useState(filters);
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<{ value: string; label: string }[]>([]);
  const [selected, select] = useState<Audit["entries"][number]>();
  const history = useInfiniteQuery({
    queryKey: [...teamKey(store), "audit", filters],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) => {
      const start = filters.date ? new Date(`${filters.date}T00:00:00`).getTime() : undefined;
      const until = start === undefined ? undefined : new Date(start);
      if (until) until.setDate(until.getDate() + 1);
      return teamRequest<Audit>(store, "audit", {
        signal,
        filters: {
          ...(filters.section && { section: filters.section }),
          ...(filters.actor && { actor: filters.actor }),
          ...(start !== undefined && until && { from: String(start), until: String(until.getTime()) }),
          ...(pageParam && { cursor: pageParam }),
        },
      });
    },
    getNextPageParam: (last) => last.next,
    retry: false,
  });
  const entries = history.data?.pages.flatMap(({ entries }) => entries) ?? [];
  const reset = () => setFilters({ section: "", date: "", actor: "" });
  const label = (entry: Audit["entries"][number]) => actionName[entry.action] ?? "Настройки магазина";
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setDraft(filters);
          setPeople([
            ...new Map([
              ...people.map((p) => [p.value, p] as const),
              ...entries.map(({ actor, name }) => [actor, { value: actor, label: name }] as const),
            ]).values(),
          ]);
          setOpen(true);
        }}
      >
        Фильтры
      </Button>
      <QueryBoundary query={history} template="list">
        {() =>
          entries.length ? (
            <>
              {entries.map((entry) => (
                <ListItem
                  key={entry.id}
                  title={label(entry)}
                  subtitle={`${entry.name} · ${dateTime.format(entry.createdAt)}`}
                  onClick={() => select(entry)}
                />
              ))}
              {history.hasNextPage && (
                <Button
                  variant="secondary"
                  loading={history.isFetchingNextPage}
                  onClick={() => void history.fetchNextPage()}
                >
                  {history.isFetchNextPageError ? "Повторить" : "Показать ещё"}
                </Button>
              )}
            </>
          ) : filters.section || filters.date || filters.actor ? (
            <EmptyState title="По этим фильтрам ничего не найдено" action="Сбросить фильтры" onAction={reset} />
          ) : (
            <EmptyState title="Действий пока нет" />
          )
        }
      </QueryBoundary>
      <Sheet open={open} title="Фильтры" onOpenChange={setOpen}>
        <Select
          label="Сотрудник"
          value={draft.actor}
          options={[{ value: "", label: "Все" }, ...people]}
          onChange={(actor) => setDraft({ ...draft, actor })}
        />
        <Select
          label="Раздел"
          value={draft.section}
          options={[
            { value: "", label: "Все" },
            ...Object.entries(sectionName).map(([value, label]) => ({ value, label })),
          ]}
          onChange={(section) => setDraft({ ...draft, section })}
        />
        <label className="flex justify-between gap-2">
          Дата
          <input
            type="date"
            value={draft.date}
            onChange={(event) => setDraft({ ...draft, date: event.target.value })}
          />
        </label>
        <Button
          full
          onClick={() => {
            setFilters(draft);
            setOpen(false);
          }}
        >
          Применить
        </Button>
        <Button
          full
          variant="secondary"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Сбросить
        </Button>
      </Sheet>
      <Sheet
        open={!!selected}
        title="Действие"
        onOpenChange={(open) => {
          if (!open) select(undefined);
        }}
      >
        {selected && (
          <>
            <ListItem title="Кто" value={selected.name} />
            <ListItem title="Когда" value={dateTime.format(selected.createdAt)} />
            <ListItem title="Раздел" value={sectionName[selected.action.split(".")[0] as keyof typeof sectionName]} />
            <ListItem title={label(selected)} />
            {selected.change.before && <ListItem title="Было" value={roleName[selected.change.before.role]} />}
            {selected.change.after && (
              <ListItem
                title="Стало"
                value={"role" in selected.change.after ? roleName[selected.change.after.role] : "Доступ отозван"}
              />
            )}
            {selected.change.from && <ListItem title="Было" value={statusName[selected.change.from]} />}
            {selected.change.to && <ListItem title="Стало" value={statusName[selected.change.to]} />}
          </>
        )}
      </Sheet>
    </>
  );
}
