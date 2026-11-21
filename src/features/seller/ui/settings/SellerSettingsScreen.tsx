import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useRef } from "react";
import { Header } from "../../../../app/shell/Header";
import { QueryBoundary } from "../../../../app/shell/QueryBoundary";
import { Screen } from "../../../../app/shell/Screen";
import { HttpError } from "../../../../shared/http-error";
import { EmptyState } from "../../../../ui/EmptyState";
import { useCabinet } from "../../api";
import { CabinetLogin } from "../CabinetLogin";
import { DeliverySettings } from "./DeliverySettings";
import { HoursSettings } from "./HoursSettings";
import { PaymentSettings } from "./PaymentSettings";
import type { SettingsFrame } from "./SettingsEditor";
import { ShopProfileSettings } from "./ShopProfileSettings";
import { ShopThemeSettings } from "./ShopThemeSettings";

const titles: Record<string, string> = {
  receiving: "Доставка и самовывоз",
  hours: "Часы работы",
  payments: "Оплата",
  "shop-data": "О магазине",
  "shop-color": "Цвет витрины",
};

export function SellerSettingsScreen() {
  const navigate = useNavigate();
  const { pathname, search } = useRouterState({ select: (state) => state.location });
  const section = pathname.split("/").at(-1) ?? "";
  const store = typeof search.store === "string" ? search.store : undefined;
  const cabinet = useCabinet(store);
  const automatic = useRef(false);
  const unauthorized = cabinet.error instanceof HttpError && cabinet.error.status === 401;
  const denied = cabinet.error instanceof HttpError && cabinet.error.status === 403;
  const frame: SettingsFrame = (content, footer) => (
    <div className="[--tab-height:0]">
      <Screen
        template="form"
        header={
          <Header
            catalog
            title={unauthorized ? "Вход" : titles[section]}
            onBack={() => {
              if (window.history.length > 1 && window.history.state?.__TSR_index > 0) window.history.back();
              else
                void navigate({
                  to: section === "shop-color" ? "/seller/showcase" : "/seller/more",
                  search: { store },
                });
            }}
          />
        }
        footer={footer}
      >
        {content}
      </Screen>
    </div>
  );
  if (unauthorized)
    return frame(
      <CabinetLogin store={store} ready={() => void cabinet.refetch()} automaticLoginAttempted={automatic} />,
    );
  if (denied)
    return frame(
      <EmptyState
        title="Нет доступа к магазину"
        action="Мои магазины"
        onAction={() => void navigate({ to: "/seller" })}
      />,
    );
  if (!cabinet.data)
    return frame(
      <QueryBoundary query={cabinet} template="form">
        {() => null}
      </QueryBoundary>,
    );
  const current = cabinet.data.current;
  if (!current) return frame(<EmptyState title="Магазина пока нет — обратитесь к администратору" />);
  const props = { store: current.slug, frame };
  if (section === "receiving") return <DeliverySettings key={current.id} {...props} />;
  if (section === "hours") return <HoursSettings key={current.id} {...props} />;
  if (section === "payments") return <PaymentSettings key={current.id} {...props} />;
  if (section === "shop-data")
    return <ShopProfileSettings key={current.id} {...props} storefrontUrl={current.storefrontUrl} />;
  return <ShopThemeSettings key={current.id} {...props} storefrontUrl={current.storefrontUrl} />;
}
