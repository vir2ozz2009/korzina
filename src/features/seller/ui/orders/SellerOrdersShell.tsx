import { useNavigate, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useCallback, useRef } from "react";
import { Header } from "../../../../app/shell/Header";
import { QueryBoundary } from "../../../../app/shell/QueryBoundary";
import { Screen } from "../../../../app/shell/Screen";
import { SellerTabs } from "../../../../app/shell/SellerTabs";
import { useBack } from "../../../../app/shell/useBack";
import { HttpError } from "../../../../shared/http-error";
import { EmptyState } from "../../../../ui/EmptyState";
import { SellerChatButton } from "../../../order-chat";
import { useCabinet } from "../../api";
import { CabinetLogin } from "../CabinetLogin";

export function SellerOrdersShell({
  title,
  children,
  footer,
}: {
  title: string;
  children: (store: string, money: boolean) => ReactNode;
  footer?: ReactNode;
}) {
  const search = useRouterState({ select: (state) => state.location.search });
  const store = typeof search.store === "string" ? search.store : undefined;
  const cabinet = useCabinet(store);
  const refetch = cabinet.refetch;
  const refresh = useCallback(() => void refetch(), [refetch]);
  const tried = useRef(false);
  const navigate = useNavigate();
  const back = useBack();
  const login = cabinet.error instanceof HttpError && cabinet.error.status === 401;
  const denied = cabinet.error instanceof HttpError && cabinet.error.status === 403;
  return (
    <Screen
      header={
        <Header
          title={login ? "Вход" : title}
          extraActions={
            !cabinet.isError && cabinet.data?.current?.permissions.includes("chat") ? (
              <SellerChatButton store={cabinet.data.current.slug} />
            ) : undefined
          }
          onBack={search.back && !login ? back : undefined}
          sellerShop={cabinet.isError ? null : (cabinet.data?.current ?? null)}
        />
      }
      template="list"
      after={
        cabinet.data?.current && !cabinet.isError ? (
          <SellerTabs store={cabinet.data.current.slug} permissions={cabinet.data.current.permissions} />
        ) : undefined
      }
      footer={footer}
    >
      {login ? (
        <CabinetLogin store={store} ready={refresh} automaticLoginAttempted={tried} />
      ) : denied ? (
        <EmptyState
          title="Нет доступа к магазину"
          action="Мои магазины"
          onAction={() => void navigate({ to: "/seller" })}
        />
      ) : (
        <QueryBoundary query={cabinet} template="list">
          {({ current }) =>
            current ? (
              children(current.slug, current.role === "owner" || current.permissions.includes("payments"))
            ) : (
              <EmptyState title="Заказы недоступны" />
            )
          }
        </QueryBoundary>
      )}
    </Screen>
  );
}
