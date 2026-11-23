import { useRouterState } from "@tanstack/react-router";
import { ChatInbox, ChatThread } from "../../../order-chat";
import { SellerOrdersShell } from "./SellerOrdersShell";

export function SellerChatScreen() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const inbox = path === "/seller/inbox";
  const number = Number(path.split("/").at(-2));
  return (
    <SellerOrdersShell title={inbox ? "Переписка по заказам" : "Чат по заказу"}>
      {(store) =>
        inbox ? (
          <ChatInbox key={store} store={store} />
        ) : (
          <ChatThread key={`${store}:${number}`} store={store} number={number} />
        )
      }
    </SellerOrdersShell>
  );
}
