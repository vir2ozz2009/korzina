import { lazy, Suspense } from "react";
import { StoreLogo } from "./StoreLogo";

const Actions = lazy(() => import("./StoreHeaderActions").then((module) => ({ default: module.StoreHeaderActions })));

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
    <header className="grid h-(--store-header-height) grid-cols-[minmax(0,1fr)_var(--store-mark-width)_minmax(0,1fr)] items-center bg-background p-(--page-x)">
      {onAddress ? (
        <button
          type="button"
          className="flex min-h-(--control-md) min-w-0 flex-col justify-center gap-0.5 text-left"
          onClick={onAddress}
        >
          <span className="text-micro font-normal text-muted-foreground">Доставим сюда</span>
          <span
            className={`max-w-full truncate text-caption font-semibold ${address ? "text-muted-foreground" : "text-primary-text"}`}
          >
            {address || "Выбрать адрес"} ›
          </span>
        </button>
      ) : (
        <span aria-hidden />
      )}
      <button
        type="button"
        className="flex h-(--store-identity-height) min-w-0 flex-col items-center justify-center gap-0.5"
        onClick={onAbout}
        aria-label={`О магазине ${name}`}
      >
        <StoreLogo name={name} src={logo} />
        <span className="w-full truncate text-micro font-medium" title={name}>
          {name}
        </span>
      </button>
      <div className="flex items-center justify-end gap-1">
        {(onChat || onProfile) && (
          <Suspense fallback={null}>
            <Actions profile={profile} onChat={onChat} onProfile={onProfile} />
          </Suspense>
        )}
      </div>
    </header>
  );
}
