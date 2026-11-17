import { MessageSquare } from "lucide-react";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { StoreLogo } from "./StoreLogo";

export interface StoreHeaderProps {
  name: string;
  logo?: string;
  address?: string;
  profile?: { name: string; src?: string };
  onAddress?: () => void;
  onAbout?: () => void;
  onChat?: () => void;
  onProfile?: () => void;
}
export function StoreHeader({ name, logo, address, profile, onAddress, onAbout, onChat, onProfile }: StoreHeaderProps) {
  return (
    <header className="store-header">
      <button type="button" className="store-address" onClick={onAddress}>
        <span className="text-micro font-normal text-muted-foreground">Доставим сюда</span>
        <span
          className={`store-address-value text-caption font-semibold ${address ? "text-muted-foreground" : "text-primary-text"}`}
        >
          {address || "Выбрать адрес"} ›
        </span>
      </button>
      <button type="button" className="store-identity" onClick={onAbout} aria-label={`О магазине ${name}`}>
        <StoreLogo name={name} src={logo} />
        <span className="store-name text-micro font-medium" title={name}>
          {name}
        </span>
      </button>
      <div className="store-account">
        <IconButton aria-label="Чат с магазином" background="card" onClick={onChat}>
          <MessageSquare size={22} />
        </IconButton>
        {profile ? (
          <IconButton aria-label="Профиль" background="card" onClick={onProfile}>
            <Avatar {...profile} />
          </IconButton>
        ) : (
          <Button variant="secondary" className="px-3" onClick={onProfile}>
            Войти
          </Button>
        )}
      </div>
    </header>
  );
}
