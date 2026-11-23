import { useNavigate, useRouterState } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Header } from "../../../app/shell/Header";
import { QueryBoundary } from "../../../app/shell/QueryBoundary";
import { Screen } from "../../../app/shell/Screen";
import { shopDateTime } from "../../../shared/datetime";
import { HttpError } from "../../../shared/http-error";
import { buyerOrderSearch, shopKey, shopTimeZone } from "../../../shared/shop-api";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { ListItem } from "../../../ui/ListItem";
import { StatusPill } from "../../../ui/StatusPill";
import { StickyFooter } from "../../../ui/StickyFooter";
import { ContactSheet } from "../../contact";
import { useChatHistory, useChatList, useReadChat } from "../api";
import { ChatComposer } from "./ChatComposer";
import { BalanceCard, eventLabel } from "./ChatEvent";
import { ChatPhoto } from "./ChatPhoto";

const needsLogin = (error: unknown) => error instanceof HttpError && error.code === "AUTH_REQUIRED";

function ChatLogin({ retry }: { retry: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <EmptyState title="Войдите, чтобы открыть переписку" action="Войти" onAction={() => setOpen(true)} />
      <ContactSheet
        mode={open ? "telegram" : undefined}
        close={() => {
          setOpen(false);
          retry();
        }}
      />
    </>
  );
}

export function BuyerInbox() {
  return (
    <Screen template="list" header={<Header title="Переписки" />}>
      <ChatInbox />
    </Screen>
  );
}
export function BuyerChatScreen() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const number = Number(path.split("/").at(-2));
  return (
    <Screen template="feedback" header={<Header title="Чат с магазином" />}>
      <ChatThread key={number} number={number} />
    </Screen>
  );
}

export function ChatInbox({ store, timeZone = shopTimeZone }: { store?: string; timeZone?: string }) {
  const navigate = useNavigate();
  const query = useChatList(store);
  if (needsLogin(query.error)) return <ChatLogin retry={() => void query.refetch()} />;
  return (
    <QueryBoundary query={query} template="list">
      {(data) => {
        const chats = Array.from(
          new Map(data.pages.flatMap((page) => page.chats).map((chat) => [chat.number, chat])).values(),
        );
        return chats.length ? (
          <>
            {chats.map((chat) => (
              <ListItem
                key={chat.number}
                title={`Заказ №${chat.number}`}
                subtitle={`${chat.preview} · ${shopDateTime(chat.lastAt, timeZone).time}`}
                icon={<MessageCircle size={20} aria-hidden />}
                value={
                  chat.unread ? (
                    <StatusPill tone="primary">{chat.unread}</StatusPill>
                  ) : chat.waiting && store ? (
                    "Ждёт ответа"
                  ) : chat.stage === "completed" || chat.stage === "cancelled" ? (
                    "Завершён"
                  ) : undefined
                }
                onClick={() =>
                  void (store
                    ? navigate({
                        to: "/seller/orders/$number/chat",
                        params: { number: String(chat.number) },
                        search: { store },
                      })
                    : navigate({
                        to: "/orders/$number/chat",
                        params: { number: String(chat.number) },
                        search: buyerOrderSearch,
                      }))
                }
              />
            ))}
            {query.hasNextPage && (
              <Button
                full
                variant="secondary"
                loading={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                Показать ещё
              </Button>
            )}
            {query.isFetchNextPageError && <p role="alert">Не удалось загрузить переписки</p>}
          </>
        ) : (
          <EmptyState title="Переписок пока нет" description="Написать магазину можно из карточки заказа." />
        );
      }}
    </QueryBoundary>
  );
}

export function ChatThread({
  number,
  store,
  timeZone = shopTimeZone,
}: {
  number: number;
  store?: string;
  timeZone?: string;
}) {
  const navigate = useNavigate();
  const history = useChatHistory(number, store);
  const { mutate: markRead } = useReadChat(number, store);
  const recorded = useRef<number>(0);
  const lastEntry = useRef<HTMLLIElement>(null);
  const latest = history.data?.pages[0]?.entries.at(-1)?.id;
  const own = store ? "seller" : "buyer";
  const draftKey = `${own}:${store ?? shopKey}:${number}`;
  const accessLost = history.error instanceof HttpError && history.error.status === 403;
  useEffect(() => {
    if (!latest || latest <= recorded.current || accessLost || !lastEntry.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || latest <= recorded.current) return;
        recorded.current = latest;
        observer.disconnect();
        markRead(latest, {
          onError: () => {
            if (recorded.current === latest) recorded.current = 0;
          },
        });
      },
      { threshold: 0.45 },
    );
    observer.observe(lastEntry.current);
    return () => observer.disconnect();
  }, [latest, accessLost, markRead]);
  if (needsLogin(history.error)) return <ChatLogin retry={() => void history.refetch()} />;
  if (!Number.isSafeInteger(number) || number < 1) return <EmptyState title="Переписка недоступна" />;
  const order = (changes = false) =>
    void (store
      ? navigate({ to: "/seller/orders/$number", params: { number: String(number) }, search: { store } })
      : navigate({
          to: changes ? "/orders/$number/changes" : "/orders/$number",
          params: { number: String(number) },
          search: buyerOrderSearch,
        }));
  return (
    <QueryBoundary query={history} template="feedback">
      {(data) => {
        const entries = Array.from(
          new Map(data.pages.flatMap((page) => page.entries).map((entry) => [entry.id, entry])).values(),
        ).sort((a, b) => a.id - b.id);
        return (
          <>
            <ListItem title={`Открыть заказ №${number}`} onClick={() => order()} />
            {history.hasNextPage && (
              <Button
                full
                variant="secondary"
                loading={history.isFetchingNextPage}
                onClick={() => void history.fetchNextPage()}
              >
                Загрузить предыдущие
              </Button>
            )}
            {history.isFetchNextPageError && <p role="alert">Не удалось загрузить предыдущие сообщения</p>}
            {!entries.length && <EmptyState title="Сообщений пока нет" />}
            <ol aria-label="История переписки" className="space-y-3">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  ref={entry.id === latest ? lastEntry : undefined}
                  className={entry.side === own ? "ml-10" : entry.side === "system" ? "" : "mr-10"}
                >
                  <Card className={entry.side === own ? "bg-primary-soft" : undefined}>
                    {entry.kind === "event" ? (
                      <>
                        <p className="text-label">{eventLabel[entry.event] ?? "Заказ обновлён"}</p>
                        {(entry.event.startsWith("composition.") || entry.event.startsWith("time.")) && (
                          <Button
                            variant="ghost"
                            onClick={() => order(entry.pending && entry.event.startsWith("composition."))}
                          >
                            {entry.event === "composition.proposed" && entry.pending
                              ? "Посмотреть изменения"
                              : entry.event === "time.pending" && entry.pending
                                ? "Посмотреть предложение"
                                : "Открыть заказ"}
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        {entry.text && <p className="whitespace-pre-wrap break-words">{entry.text}</p>}
                        {entry.mediaId && <ChatPhoto number={number} mediaId={entry.mediaId} store={store} />}
                      </>
                    )}
                    <time
                      className="text-small text-muted-foreground"
                      dateTime={new Date(entry.createdAt).toISOString()}
                    >
                      {shopDateTime(entry.createdAt, timeZone).time}
                    </time>
                  </Card>
                </li>
              ))}
            </ol>
            {data.pages[0]?.balance && <BalanceCard balance={data.pages[0].balance} onOrder={() => order()} />}
            {data.pages[0]?.writable ? (
              <StickyFooter>
                <ChatComposer key={draftKey} draftKey={draftKey} number={number} store={store} />
              </StickyFooter>
            ) : (
              <p>Переписка закрыта. История доступна для чтения.</p>
            )}
          </>
        );
      }}
    </QueryBoundary>
  );
}
