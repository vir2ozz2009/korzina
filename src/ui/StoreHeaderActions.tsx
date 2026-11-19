import { MessageSquare, User } from "lucide-react";
import { Avatar } from "./Avatar";
import { IconButton } from "./IconButton";
import type { StoreHeaderProps } from "./StoreHeader";

export function StoreHeaderActions({
  profile,
  onChat,
  onProfile,
}: Pick<StoreHeaderProps, "profile" | "onChat" | "onProfile">) {
  return (
    <>
      {onChat && (
        <IconButton aria-label="Чат с магазином" background="card" onClick={onChat}>
          <MessageSquare size={22} />
        </IconButton>
      )}
      {onProfile && (
        <IconButton aria-label="Профиль" background="card" onClick={onProfile}>
          {profile ? <Avatar {...profile} /> : <User size={22} />}
        </IconButton>
      )}
    </>
  );
}
