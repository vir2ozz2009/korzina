import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Bell, MessageCircle } from "lucide-react";
import { useState } from "react";
import { Header } from "../../../../app/shell/Header";
import { QueryBoundary } from "../../../../app/shell/QueryBoundary";
import { Screen } from "../../../../app/shell/Screen";
import { SellerTabs } from "../../../../app/shell/SellerTabs";
import type { StaffInvite } from "../../../../shared/contracts/staff";
import { defaultShopTimeZone } from "../../../../shared/datetime";
import { Button } from "../../../../ui/Button";
import { Card } from "../../../../ui/Card";
import { EmptyState } from "../../../../ui/EmptyState";
import { ListItem } from "../../../../ui/ListItem";
import { useCabinet } from "../../api";
import { TeamInviteForm, TeamMemberForm } from "./TeamForms";
import { TeamHistory } from "./TeamHistory";
import { TeamNotifications } from "./TeamNotifications";
import { type Invites, type Members, roleName, teamKey, teamRequest, useStaffBot } from "./team-api";

export function TeamScreen() {
  const { pathname, search } = useRouterState({ select: (state) => state.location });
  const store = typeof search.store === "string" ? search.store : undefined;
  const cabinet = useCabinet(store);
  const current = cabinet.data?.current;
  const history = pathname === "/seller/history";
  const notifications = pathname === "/seller/notifications";
  const bot = pathname === "/seller/bot";
  const title = history ? "История действий" : notifications ? "Уведомления" : bot ? "Бот магазина" : "Сотрудники";
  return (
    <Screen
      template="list"
      header={<Header title={title} sellerShop={cabinet.isError ? null : (current ?? null)} />}
      after={
        current ? (
          <SellerTabs store={current.slug} permissions={current.permissions} promotions={current.promotions} />
        ) : undefined
      }
    >
      <QueryBoundary query={cabinet} template="list">
        {({ current }) =>
          current ? (
            history ? (
              <TeamHistory key={current.slug} store={current.slug} timeZone={current.timeZone ?? defaultShopTimeZone} />
            ) : notifications ? (
              <TeamNotifications store={current.slug} />
            ) : bot ? (
              <ShopBot store={current.slug} canManage={current.permissions.includes("shop_settings")} />
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

function ShopBot({ store, canManage }: { store: string; canManage: boolean }) {
  const navigate = useNavigate();
  const query = useStaffBot(store);
  return (
    <QueryBoundary query={query} template="form">
      {({ shopBot }) => (
        <>
          <ListItem
            title={shopBot ? `Бот подключён · @${shopBot}` : "Бота подключает администратор Korzina"}
            subtitle={shopBot ? undefined : "Личные уведомления появятся после подключения бота"}
            icon={<MessageCircle size={20} />}
          />
          {canManage && (
            <ListItem
              title="Настроить уведомления сотрудников"
              icon={<Bell size={20} />}
              onClick={() =>
                void navigate({
                  to: "/seller/notifications",
                  search: (previous) => ({ shop: previous.shop, store }),
                })
              }
            />
          )}
        </>
      )}
    </QueryBoundary>
  );
}

function TeamList({ store }: { store: string }) {
  const bot = useStaffBot(store);
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
          <Button full disabled={!bot.data?.shopBot} onClick={() => select({ kind: "new" })}>
            Добавить сотрудника
          </Button>
          {bot.data?.shopBot === null && <p className="text-meta">Сначала администратор подключит бота</p>}
          <Card>
            {pages.length === 1 && pages[0].members.length === 1 && !members.hasNextPage && (
              <p>Пока других сотрудников нет</p>
            )}
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
