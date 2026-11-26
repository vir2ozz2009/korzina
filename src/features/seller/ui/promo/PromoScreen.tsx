import { useRef } from "react";
import { Screen } from "../../../../app/shell/Screen";
import { defaultShopTimeZone } from "../../../../shared/datetime";
import { HttpError } from "../../../../shared/http-error";
import { Card } from "../../../../ui/Card";
import { Header } from "../../../../ui/Header";
import { useCabinet } from "../../api";
import { CabinetLogin } from "../CabinetLogin";
import { useCatalogNav } from "../catalog/navigation";
import { PromoWorkspace } from "./PromoWorkspace";

export function PromoScreen() {
  const nav = useCatalogNav();
  const store = nav.params.get("store") ?? undefined;
  const cabinet = useCabinet(store);
  const current = cabinet.data?.current;
  const tried = useRef(false);
  const login = cabinet.error instanceof HttpError && cabinet.error.status === 401;
  if (!current)
    return (
      <Screen
        template="list"
        header={<Header title={login ? "Вход" : "Продвижение"} />}
        state={
          login
            ? undefined
            : {
                query: { ...cabinet, data: cabinet.data ? [] : undefined },
              }
        }
      >
        {login && <CabinetLogin store={store} ready={() => void cabinet.refetch()} automaticLoginAttempted={tried} />}
      </Screen>
    );
  if (!current.promotions)
    return (
      <Screen template="list" header={<Header title="Продвижение" />}>
        <Card>Акции недоступны для этого магазина или вашей роли.</Card>
      </Screen>
    );
  return (
    <PromoWorkspace
      key={`${current.id}:${cabinet.data?.telegramId}`}
      store={current.slug}
      account={cabinet.data?.telegramId ?? ""}
      permissions={current.permissions}
      zone={current.timeZone ?? defaultShopTimeZone}
    />
  );
}
