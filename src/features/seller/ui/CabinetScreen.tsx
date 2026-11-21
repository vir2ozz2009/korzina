import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowUpRight,
  ChevronDown,
  Clock3,
  CreditCard,
  Info,
  LogOut,
  MessageCircle,
  Store,
  Truck,
  UserRound,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Header } from "../../../app/shell/Header";
import { QueryBoundary } from "../../../app/shell/QueryBoundary";
import { Screen } from "../../../app/shell/Screen";
import { SellerTabs } from "../../../app/shell/SellerTabs";
import { HttpError } from "../../../shared/http-error";
import { Avatar } from "../../../ui/Avatar";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { IconButton } from "../../../ui/IconButton";
import { ListItem } from "../../../ui/ListItem";
import { Sheet } from "../../../ui/Sheet";
import { StatusPill } from "../../../ui/StatusPill";
import { useCabinet, useSellerLogout } from "../api";
import { CabinetLogin } from "./CabinetLogin";
import { PauseCard } from "./settings/PauseCard";

const statusNames: Record<string, string> = { draft: "Черновик", active: "Открыт", paused: "Пауза" };

export function CabinetScreen() {
  const { pathname, search } = useRouterState({ select: (state) => state.location });
  const store = typeof search.store === "string" ? search.store : undefined;
  const query = useCabinet(store);
  const automaticLoginAttempted = useRef(false);
  const logout = useSellerLogout();
  const refetch = query.refetch;
  const refresh = useCallback(() => void refetch(), [refetch]);
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<"shops" | "logout">();
  const more = pathname === "/seller/more";
  const profile = pathname === "/seller/profile";
  const current = query.data?.current;
  const title = profile ? "Профиль продавца" : more ? "Ещё" : (current?.name ?? "Кабинет продавца");
  const needsLogin = query.error instanceof HttpError && query.error.status === 401;
  const denied = query.error instanceof HttpError && query.error.status === 403;
  return (
    <Screen
      template="form"
      after={
        query.data && !query.isError ? <SellerTabs store={current?.slug} account={query.data.telegramId} /> : undefined
      }
      header={
        <Header
          title={needsLogin ? "Вход" : title}
          actions={
            query.data &&
            !query.isError &&
            query.data.shops.length > 1 &&
            !profile && (
              <IconButton aria-label="Выбрать магазин" onClick={() => setSheet("shops")}>
                <ChevronDown size={20} />
              </IconButton>
            )
          }
        />
      }
    >
      {needsLogin ? (
        <CabinetLogin store={store} ready={refresh} automaticLoginAttempted={automaticLoginAttempted} />
      ) : denied ? (
        <EmptyState
          title="Нет доступа к магазину"
          action="Мои магазины"
          onAction={() => void navigate({ to: "/seller", search: { shop: search.shop } })}
        />
      ) : (
        <QueryBoundary query={query} template="form">
          {({ telegramId, current: shop, shops }) => (
            <>
              {profile ? (
                <ListItem
                  title="Telegram"
                  subtitle={`ID ${telegramId}`}
                  value="Подключён"
                  icon={<MessageCircle size={21} />}
                />
              ) : more ? (
                <>
                  {shop && (
                    <>
                      <ListItem
                        title="Доставка и самовывоз"
                        icon={<Truck size={20} />}
                        onClick={() =>
                          void navigate({ to: "/seller/receiving", search: { ...search, store: shop.slug } })
                        }
                      />
                      <ListItem
                        title="Часы работы"
                        icon={<Clock3 size={20} />}
                        onClick={() => void navigate({ to: "/seller/hours", search: { ...search, store: shop.slug } })}
                      />
                      <ListItem
                        title="Оплата"
                        icon={<CreditCard size={20} />}
                        onClick={() =>
                          void navigate({ to: "/seller/payments", search: { ...search, store: shop.slug } })
                        }
                      />
                      <ListItem
                        title="О магазине"
                        icon={<Info size={20} />}
                        onClick={() =>
                          void navigate({ to: "/seller/shop-data", search: { ...search, store: shop.slug } })
                        }
                      />
                    </>
                  )}
                  <ListItem
                    title="Витрина"
                    icon={<Store size={20} />}
                    onClick={() =>
                      void navigate({
                        href: `/seller/showcase${shop ? `?store=${encodeURIComponent(shop.slug)}` : ""}`,
                      })
                    }
                  />
                  <ListItem
                    title="Профиль продавца"
                    icon={<UserRound size={20} />}
                    onClick={() => void navigate({ to: "/seller/profile", search })}
                  />
                  <ListItem title="Выйти" icon={<LogOut size={20} />} onClick={() => setSheet("logout")} />
                </>
              ) : shop ? (
                <>
                  <Card size="lg">
                    <div className="flex items-start gap-3">
                      <Avatar name={shop.name} />
                      <div className="min-w-0 flex-1">
                        <h2 className="text-title-2">{shop.name}</h2>
                        <p className="mt-1 break-all text-small text-muted-foreground">{shop.storefrontUrl}</p>
                      </div>
                      <StatusPill
                        tone={shop.status === "active" ? "success" : shop.status === "paused" ? "warning" : "neutral"}
                      >
                        {statusNames[shop.status]}
                      </StatusPill>
                    </div>
                    {shop.status === "draft" && (
                      <p className="text-small text-muted-foreground">Витрина пока закрыта</p>
                    )}
                  </Card>
                  <PauseCard key={shop.id} store={shop.slug} />
                  <ListItem
                    title="Открыть витрину"
                    icon={<ArrowUpRight size={21} />}
                    onClick={() => location.assign(shop.storefrontUrl)}
                  />
                </>
              ) : (
                <Card>
                  <EmptyState title="Магазина пока нет — обратитесь к администратору" />
                </Card>
              )}
              {sheet === "shops" && (
                <Sheet
                  open
                  title="Магазины"
                  onOpenChange={(open) => {
                    if (!open) setSheet(undefined);
                  }}
                >
                  {shops.map((item) => (
                    <ListItem
                      key={item.id}
                      title={item.name}
                      subtitle={item.storefrontUrl}
                      value={item.id === current?.id ? "Выбран" : undefined}
                      onClick={() => {
                        setSheet(undefined);
                        void navigate({ to: "/seller", search: { ...search, store: item.slug } });
                      }}
                    />
                  ))}
                </Sheet>
              )}
              {sheet === "logout" && (
                <Sheet
                  open
                  title="Выйти из кабинета?"
                  onOpenChange={(open) => {
                    if (!open && !logout.isPending) setSheet(undefined);
                  }}
                >
                  <p className="text-body">Чтобы снова войти, откройте кабинет через Telegram.</p>
                  {logout.error && <p role="alert">{logout.error.message}</p>}
                  <Button
                    full
                    loading={logout.isPending}
                    onClick={() =>
                      logout.mutate(undefined, {
                        onSuccess: () => {
                          setSheet(undefined);
                          void navigate({ to: "/", search: { shop: search.shop }, replace: true });
                        },
                      })
                    }
                  >
                    Выйти
                  </Button>
                  <Button full variant="secondary" disabled={logout.isPending} onClick={() => setSheet(undefined)}>
                    Отмена
                  </Button>
                </Sheet>
              )}
            </>
          )}
        </QueryBoundary>
      )}
    </Screen>
  );
}
