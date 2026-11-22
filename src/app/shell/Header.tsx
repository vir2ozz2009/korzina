import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Header as KitHeader } from "../../ui/Header";
import { StoreLogo } from "../../ui/StoreLogo";
import { bootstrap } from "../bootstrap";
import { useBack } from "./useBack";

export function Header({
  title,
  actions,
  onBack,
  sellerShop,
  catalog = false,
}: {
  title: string;
  actions?: ReactNode;
  onBack?: () => void;
  sellerShop?: { name: string; storefrontUrl: string } | null;
  catalog?: boolean;
}) {
  const back = useBack();
  const root = useRouterState({ select: (state) => state.matches.at(-1)?.staticData.root ?? false });
  return (
    <div className="[&_header]:h-(--screen-header-height)">
      <KitHeader
        title={title}
        background={catalog ? "card" : "background"}
        headingLevel={catalog ? 1 : 2}
        actions={
          actions ??
          (!catalog && sellerShop !== null && (
            <a
              href={sellerShop?.storefrontUrl ?? "/"}
              className="flex size-11 shrink-0 items-center justify-center"
              aria-label="На главную"
            >
              <StoreLogo name={sellerShop?.name ?? bootstrap?.name ?? "Магазин"} />
            </a>
          ))
        }
        onBack={onBack ?? (root ? undefined : back)}
        telegram={!!window.Telegram?.WebApp}
      />
    </div>
  );
}
