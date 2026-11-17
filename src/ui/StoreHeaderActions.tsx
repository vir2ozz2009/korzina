import { MessageSquare } from "lucide-react";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
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
      {onProfile &&
        (profile ? (
          <IconButton aria-label="Профиль" background="card" onClick={onProfile}>
            <Avatar {...profile} />
          </IconButton>
        ) : (
          <Button variant="secondary" className="px-3" onClick={onProfile}>
            Войти
          </Button>
        ))}
    </>
  );
}
