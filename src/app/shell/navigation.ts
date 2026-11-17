import type { TemplateName } from "../templates/types";

type TransitionKind = "push" | "sheet" | "tab" | "fade" | "none";
declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    transition?: TransitionKind;
    template?: TemplateName;
    title?: string;
    root?: boolean;
  }
}
export function canGoBack(index: number | undefined) {
  return (index ?? 0) > 0;
}
