import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Clock3,
  CreditCard,
  History,
  Info,
  LogOut,
  MessageCircle,
  Store,
  Truck,
  UserRound,
  Users,
} from "lucide-react";
import { ListItem } from "../../../ui/ListItem";
import type { useCabinet } from "../api";

type Shop = NonNullable<ReturnType<typeof useCabinet>["data"]>["current"];

export function CabinetMore({ shop, onLogout }: { shop: Shop; onLogout: () => void }) {
  const search = useRouterState({ select: (state) => state.location.search });
  const navigate = useNavigate();
  return (
    <>
      {shop && (
        <>
          {shop.role === "owner" && (
            <ListItem
              title="Сотрудники"
              icon={<Users size={20} />}
              onClick={() => void navigate({ to: "/seller/team", search: { ...search, store: shop.slug } })}
            />
          )}
          {(shop.role === "owner" || shop.teamRole === "manager") && (
            <>
              <ListItem
                title="Бот магазина"
                icon={<MessageCircle size={20} />}
                onClick={() => void navigate({ to: "/seller/bot", search: { ...search, store: shop.slug } })}
              />
              <ListItem
                title="Уведомления"
                icon={<Bell size={20} />}
                onClick={() => void navigate({ to: "/seller/notifications", search: { ...search, store: shop.slug } })}
              />
              <ListItem
                title="История действий"
                icon={<History size={20} />}
                onClick={() => void navigate({ to: "/seller/history", search: { ...search, store: shop.slug } })}
              />
            </>
          )}
          {(!shop.teamRole || shop.permissions.includes("shop_settings")) && (
            <>
              <ListItem
                title="Доставка и самовывоз"
                icon={<Truck size={20} />}
                onClick={() => void navigate({ to: "/seller/receiving", search: { ...search, store: shop.slug } })}
              />
              <ListItem
                title="Часы работы"
                icon={<Clock3 size={20} />}
                onClick={() => void navigate({ to: "/seller/hours", search: { ...search, store: shop.slug } })}
              />
              <ListItem
                title="Оплата"
                icon={<CreditCard size={20} />}
                onClick={() => void navigate({ to: "/seller/payments", search: { ...search, store: shop.slug } })}
              />
              <ListItem
                title="О магазине"
                icon={<Info size={20} />}
                onClick={() => void navigate({ to: "/seller/shop-data", search: { ...search, store: shop.slug } })}
              />
            </>
          )}
        </>
      )}
      {(!shop?.teamRole || shop.permissions.includes("products")) && (
        <ListItem
          title="Витрина"
          icon={<Store size={20} />}
          onClick={() =>
            void navigate({
              href: `/seller/showcase${shop ? `?store=${encodeURIComponent(shop.slug)}` : ""}`,
            })
          }
        />
      )}
      <ListItem
        title="Профиль продавца"
        icon={<UserRound size={20} />}
        onClick={() => void navigate({ to: "/seller/profile", search })}
      />
      <ListItem title="Выйти" icon={<LogOut size={20} />} onClick={onLogout} />
    </>
  );
}
