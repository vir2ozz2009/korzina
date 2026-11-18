import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Header as KitHeader } from "../../ui/Header";
import { StoreLogo } from "../../ui/StoreLogo";
import { bootstrap } from "../bootstrap";
import { useBack } from "./useBack";

export function Header({ title, actions }: { title: string; actions?: ReactNode }) {
  const back = useBack();
  const root = useRouterState({ select: (state) => state.matches.at(-1)?.staticData.root ?? false });
  return (
    <div className="[&_h2]:truncate [&_header]:h-18">
      <KitHeader
        title={title}
        background="background"
        actions={
          actions ?? (
            <a href="/" className="flex size-11 shrink-0 items-center justify-center" aria-label="На главную">
              <StoreLogo name={bootstrap?.name ?? "Магазин"} />
            </a>
          )
        }
        onBack={root ? undefined : back}
        telegram={!!window.Telegram?.WebApp}
      />
    </div>
  );
}
