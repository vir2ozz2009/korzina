import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Header as KitHeader } from "../../ui/Header";
import { useBack } from "./useBack";

export function Header({ title, actions }: { title: string; actions?: ReactNode }) {
  const back = useBack();
  const root = useRouterState({ select: (state) => state.matches.at(-1)?.staticData.root ?? false });
  return (
    <KitHeader title={title} actions={actions} onBack={root ? undefined : back} telegram={!!window.Telegram?.WebApp} />
  );
}
