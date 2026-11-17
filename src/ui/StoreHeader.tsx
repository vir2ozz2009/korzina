import { MessageCircle, UserRound } from "lucide-react";
import { IconButton } from "./IconButton";
import { StoreLogo } from "./StoreLogo";
export function StoreHeader({
  name,
  logo,
  address,
  onAddress,
  onChat,
  onProfile,
}: {
  name: string;
  logo?: string;
  address: string;
  onAddress: () => void;
  onChat: () => void;
  onProfile: () => void;
}) {
  return (
    <header className="flex items-center gap-2 bg-card p-3">
      <button type="button" onClick={onAddress} className="min-h-11 min-w-0 flex-1 text-left">
        <span className="block text-micro text-muted-foreground">Доставим сюда</span>
        <span className="line-clamp-2 text-caption font-semibold">{address} ›</span>
      </button>
      <div className="flex max-w-24 flex-col items-center gap-1">
        <StoreLogo name={name} src={logo} />
        <span className="line-clamp-1 text-micro">{name}</span>
      </div>
      <IconButton aria-label="Чат с магазином" onClick={onChat}>
        <MessageCircle size={22} />
      </IconButton>
      <IconButton aria-label="Профиль" onClick={onProfile}>
        <UserRound size={22} />
      </IconButton>
    </header>
  );
}
