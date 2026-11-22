import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { QueryBoundary, type QueryResult } from "../../../../app/shell/QueryBoundary";
import { useToast } from "../../../../app/shell/ToastProvider";
import {
  type StaffAccess,
  type StaffInvite,
  staffPermissions,
  staffRole,
  type TeamMember,
} from "../../../../shared/contracts/staff";
import { Button } from "../../../../ui/Button";
import { Dialog } from "../../../../ui/Dialog";
import { Select } from "../../../../ui/Select";
import { Sheet } from "../../../../ui/Sheet";
import { Switch } from "../../../../ui/Switch";
import { useShareLink } from "../useShareLink";
import { roleName, teamKey, teamRequest, useTeamCommand } from "./team-api";

const sections = { orders: "Заказы", payments: "Деньги", products: "Товары" } as const;
const manual = Object.keys(sections) as (keyof typeof sections)[];
const roles = staffRole.options.map((value) => ({ value, label: roleName[value] }));
function Roles({ access, change }: { access: StaffAccess; change: (access: StaffAccess) => void }) {
  return (
    <>
      <Select
        label="Роль"
        value={access.role}
        options={roles}
        onChange={(value) => {
          const role = staffRole.parse(value);
          change(role === "custom" ? { role, sections: [] } : { role });
        }}
      />
      {access.role === "custom" &&
        manual.map((section) => (
          <Switch
            key={section}
            label={sections[section]}
            checked={access.sections.includes(section)}
            onChange={(event) =>
              change({
                role: "custom",
                sections: event.target.checked
                  ? [...access.sections, section]
                  : access.sections.filter((entry) => entry !== section),
              })
            }
          />
        ))}
    </>
  );
}

export function TeamInviteForm({ store, id, close }: { store: string; id?: string; close: () => void }) {
  const [access, setAccess] = useState<StaffAccess>({ role: "picker" });
  const [issued, setIssued] = useState<StaffInvite>();
  const [confirm, setConfirm] = useState(false);
  const share = useShareLink();
  const command = useTeamCommand<StaffInvite>(store);
  const invite = useQuery({
    queryKey: [...teamKey(store), "invite", id],
    enabled: !!id,
    queryFn: ({ signal }) => teamRequest<StaffInvite>(store, `invites/${id}`, { signal }),
    retry: false,
  });
  const details = (item: StaffInvite) => (
    <>
      <p>
        {roleName[item.role]} · до {new Date(item.expiresAt).toLocaleDateString("ru")}
      </p>
      {item.url && item.state === "pending" && (
        <>
          <p className="break-all text-small">{item.url}</p>
          <Button full onClick={() => void share(item.url ?? "", false)}>
            Скопировать ссылку
          </Button>
          <Button full variant="secondary" onClick={() => void share(item.url ?? "")}>
            Поделиться
          </Button>
          <Button full variant="ghost" onClick={() => setConfirm(true)}>
            Отозвать приглашение
          </Button>
        </>
      )}
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Отозвать приглашение?"
        description={command.error?.message ?? "Ссылка перестанет работать"}
        confirm="Отозвать приглашение"
        loading={command.isPending}
        onConfirm={() => command.mutate({ path: `invites/${item.id}/revoke` }, { onSuccess: close })}
      />
    </>
  );
  return (
    <Sheet
      open
      title={id || issued ? "Приглашение" : "Добавить сотрудника"}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      {issued ? (
        details(issued)
      ) : id ? (
        <QueryBoundary query={invite} template="form">
          {details}
        </QueryBoundary>
      ) : (
        <>
          <Roles access={access} change={setAccess} />
          <p className="text-small">Одноразовая ссылка действует 7 дней.</p>
          {command.error && <p role="alert">{command.error.message}</p>}
          <Button
            full
            loading={command.isPending}
            onClick={() =>
              command.mutate(
                { path: "invites", body: access },
                {
                  onSuccess: setIssued,
                },
              )
            }
          >
            Создать приглашение
          </Button>
        </>
      )}
    </Sheet>
  );
}

export function TeamMemberForm({
  store,
  query,
  close,
}: {
  store: string;
  query: QueryResult<TeamMember>;
  close: () => void;
}) {
  return (
    <Sheet
      open
      title={query.data?.name ?? "Сотрудник"}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <QueryBoundary query={query} template="form">
        {(member) =>
          member.role === "owner" ? (
            <p>{roleName.owner}</p>
          ) : (
            <AccessForm key={`${member.id}:${member.version}`} store={store} member={member} close={close} />
          )
        }
      </QueryBoundary>
    </Sheet>
  );
}

function AccessForm({ store, member, close }: { store: string; member: TeamMember; close: () => void }) {
  const [access, setAccess] = useState<StaffAccess>(() =>
    member.role === "custom" || member.role === "owner"
      ? { role: "custom", sections: manual.filter((section) => member.permissions.includes(section)) }
      : { role: member.role },
  );
  const [confirm, setConfirm] = useState<"save" | "revoke">();
  const [dirty, setDirty] = useState(false);
  const notify = useToast();
  const command = useTeamCommand(store);
  const path = `members/${encodeURIComponent(member.id)}`;
  const saving = confirm === "save";
  const commit = () => {
    command.mutate(
      saving
        ? { path, method: "PUT", body: { access, version: member.version } }
        : { path: `${path}/revoke`, body: { version: member.version } },
      {
        onSuccess: () => {
          notify(saving ? "Права сохранены" : "Доступ отозван");
          close();
        },
      },
    );
  };
  return (
    <>
      <Roles
        access={access}
        change={(next) => {
          setDirty(true);
          setAccess(next);
        }}
      />
      {command.error && !confirm && <p role="alert">{command.error.message}</p>}
      <Button full disabled={!dirty} onClick={() => setConfirm("save")}>
        Сохранить
      </Button>
      <Button
        full
        variant="secondary"
        disabled={dirty}
        loading={!confirm && command.isPending}
        onClick={() =>
          command.mutate({ path: `${path}/test` }, { onSuccess: () => notify("Тестовое сообщение отправлено") })
        }
      >
        Прислать тестовое
      </Button>
      {dirty && <p className="text-small">Сначала сохраните изменения</p>}
      <Button full variant="ghost" onClick={() => setConfirm("revoke")}>
        Отозвать доступ
      </Button>
      <Dialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open) setConfirm(undefined);
        }}
        title={saving ? "Что изменится" : "Отозвать доступ?"}
        description={
          command.error?.message ??
          (saving
            ? `${roleName[access.role]}. Доступ к разделам: ${
                manual
                  .filter((section) => staffPermissions(access).includes(section))
                  .map((section) => sections[section])
                  .join(", ") || "нет"
              }.`
            : "Сотрудник потеряет доступ к магазину на всех устройствах.")
        }
        confirm={saving ? "Сохранить" : "Отозвать доступ"}
        loading={command.isPending}
        onConfirm={commit}
      />
    </>
  );
}
