import { lazy, Suspense } from "react";
import { StoreLogo } from "./StoreLogo";

const Actions = lazy(() => import("./StoreHeaderActions").then((module) => ({ default: module.StoreHeaderActions })));

export interface StoreHeaderProps {
  name: string;
  logo?: string;
  logoShape?: "circle" | "square" | "wide";
  address?: string;
  profile?: { name: string; src?: string };
  onAddress?: () => void;
  onAbout?: () => void;
  onChat?: () => void;
  onProfile?: () => void;
}
export function StoreHeader({
  name,
  logo,
  logoShape,
  address,
  profile,
  onAddress,
  onAbout,
  onChat,
  onProfile,
}: StoreHeaderProps) {
  const Identity = onAbout ? "button" : "div";
  return (
    <header
      className={`grid min-h-(--store-header-height) items-center gap-2 bg-background p-(--page-x) ${onAddress ? "grid-cols-[minmax(0,1fr)_var(--store-mark-width)_minmax(0,1fr)]" : "grid-cols-[minmax(0,1fr)_auto]"}`}
    >
      {onAddress && (
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
      )}
      <Identity
        type={onAbout ? "button" : undefined}
        className={`flex min-h-(--store-identity-height) min-w-0 items-center gap-2 ${onAddress ? "flex-col justify-center" : "text-left"}`}
        onClick={onAbout}
        aria-label={onAbout ? `О магазине ${name}` : undefined}
      >
        <div className="shrink-0">
          <StoreLogo name={name} src={logo} shape={logoShape} />
        </div>
        {logoShape !== "wide" && (
          <span className={`min-w-0 wrap-anywhere font-medium ${onAddress ? "text-micro" : "text-label"}`}>{name}</span>
        )}
      </Identity>
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
