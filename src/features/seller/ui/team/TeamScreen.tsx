import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Header } from "../../../../app/shell/Header";
import { QueryBoundary } from "../../../../app/shell/QueryBoundary";
import { Screen } from "../../../../app/shell/Screen";
import { SellerTabs } from "../../../../app/shell/SellerTabs";
import type { StaffInvite } from "../../../../shared/contracts/staff";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { EmptyState } from "../../../../ui/EmptyState";
import { ListItem } from "../../../../ui/ListItem";
import { useCabinet } from "../../api";
import { TeamInviteForm, TeamMemberForm } from "./TeamForms";
import { TeamHistory } from "./TeamHistory";
import { TeamNotifications } from "./TeamNotifications";
import { type Invites, type Members, roleName, teamKey, teamRequest } from "./team-api";

export function TeamScreen() {
  const { pathname, search } = useRouterState({ select: (state) => state.location });
  const store = typeof search.store === "string" ? search.store : undefined;
  const cabinet = useCabinet(store);
  const current = cabinet.data?.current;
  const history = pathname === "/seller/history";
  const notifications = pathname === "/seller/notifications";
  const title = history ? "История действий" : notifications ? "Уведомления" : "Команда";
  return (
    <Screen
      template="list"
      header={<Header title={title} actions={null} />}
      after={
        current ? (
          <SellerTabs store={current.slug} account={cabinet.data?.telegramId} permissions={current.permissions} />
        ) : undefined
      }
    >
      <QueryBoundary query={cabinet} template="list">
        {({ current }) =>
          current ? (
            history ? (
              <TeamHistory store={current.slug} />
            ) : notifications ? (
              <TeamNotifications store={current.slug} />
            ) : (
              <TeamList key={current.slug} store={current.slug} />
            )
          ) : (
            <EmptyState title="Выберите магазин в кабинете" />
          )
        }
      </QueryBoundary>
    </Screen>
  );
}

function TeamList({ store }: { store: string }) {
  const members = useInfiniteQuery({
    queryKey: [...teamKey(store), "members"],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      teamRequest<Members>(store, "members", {
        signal,
        filters: pageParam ? { after: pageParam } : undefined,
      }),
    getNextPageParam: (last) => last.next,
    retry: false,
  });
  const invites = useInfiniteQuery({
    queryKey: [...teamKey(store), "invites"],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      teamRequest<Invites>(store, "invites", {
        signal,
        filters: pageParam ? { after: pageParam } : undefined,
      }),
    getNextPageParam: (last) => last.next,
    retry: false,
  });
  const [selection, select] = useState<{ kind: "member" | "invite"; id: string } | { kind: "new" }>();
  const selected = selection?.kind === "member" ? selection.id : undefined;
  const record = useQuery({
    queryKey: [...teamKey(store), "member", selected],
    enabled: !!selected,
    queryFn: ({ signal }) =>
      teamRequest<Members["members"][number]>(store, `members/${encodeURIComponent(selected ?? "")}`, { signal }),
    retry: false,
  });
  return (
    <QueryBoundary query={members} template="list">
      {({ pages }) => (
        <>
          <Button full onClick={() => select({ kind: "new" })}>
            Пригласить сотрудника
          </Button>
          <Card>
            <h2 className="text-title-3">Сотрудники</h2>
            {pages
              .flatMap(({ members }) => members)
              .map((member) => (
                <ListItem
                  key={member.id}
                  title={member.name}
                  subtitle={roleName[member.role]}
                  onClick={() => select({ kind: "member", id: member.id })}
                />
              ))}
            {members.hasNextPage && (
              <Button
                variant="secondary"
                loading={members.isFetchingNextPage}
                onClick={() => void members.fetchNextPage()}
              >
                Показать ещё
              </Button>
            )}
          </Card>
          <Card>
            <h2 className="text-title-3">Приглашения</h2>
            <QueryBoundary query={invites} template="list">
              {({ pages: lists }) => (
                <>
                  {lists.every(({ invites }) => !invites.length) && <p>Приглашений пока нет</p>}
                  {lists
                    .flatMap(({ invites }) => invites)
                    .map((invite: StaffInvite) => (
                      <ListItem
                        key={invite.id}
                        title={roleName[invite.role]}
                        subtitle={
                          { pending: "Ожидает", accepted: "Принято", expired: "Истекло", revoked: "Отозвано" }[
                            invite.state
                          ]
                        }
                        onClick={() => select({ kind: "invite", id: invite.id })}
                      />
                    ))}
                  {invites.hasNextPage && (
                    <Button
                      variant="secondary"
                      loading={invites.isFetchingNextPage}
                      onClick={() => void invites.fetchNextPage()}
                    >
                      Показать ещё
                    </Button>
                  )}
                </>
              )}
            </QueryBoundary>
          </Card>
          {selection &&
            (selection.kind === "member" ? (
              <TeamMemberForm store={store} query={record} close={() => select(undefined)} />
            ) : (
              <TeamInviteForm
                key={selection.kind === "invite" ? selection.id : "new"}
                store={store}
                id={selection.kind === "invite" ? selection.id : undefined}
                close={() => select(undefined)}
              />
            ))}
        </>
      )}
    </QueryBoundary>
  );
}
