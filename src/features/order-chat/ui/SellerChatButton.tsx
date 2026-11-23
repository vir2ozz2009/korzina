import { useNavigate } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { IconButton } from "../../../ui/IconButton";
import { StatusPill } from "../../../ui/StatusPill";
import { useChatBadge } from "../api";

export function SellerChatButton({ store }: { store: string }) {
  const navigate = useNavigate();
  const unread = useChatBadge(store).data?.count ?? 0;
  return (
    <div className="relative">
      <IconButton
        aria-label={unread ? `Сообщения, непрочитанных: ${unread}` : "Сообщения"}
        onClick={() => void navigate({ to: "/seller/inbox", search: { store } })}
      >
        <MessageCircle size={22} aria-hidden />
      </IconButton>
      {unread > 0 && (
        <span className="pointer-events-none absolute -right-1 -top-1">
          <StatusPill tone="primary">{unread}</StatusPill>
        </span>
      )}
    </div>
  );
}
