import { useRouterState } from "@tanstack/react-router";
import { type ReactNode, useRef } from "react";

export function Transition({ children }: { children: ReactNode }) {
  const state = useRouterState({
    select: (state) => {
      const match = state.matches.at(-1);
      const sheet = match?.staticData.transition === "sheet";
      return {
        key: (sheet ? state.matches.at(-2) : match)?.pathname ?? state.location.pathname,
        index: state.location.state.__TSR_index ?? 0,
        kind: match?.staticData.transition ?? "none",
      };
    },
  });
  const previous = useRef({ key: state.key, index: state.index, back: false, kind: state.kind });
  if (state.key !== previous.current.key)
    previous.current = {
      key: state.key,
      index: state.index,
      back: state.index < previous.current.index,
      kind: state.index < previous.current.index && previous.current.kind === "push" ? "push" : state.kind,
    };
  return (
    <div
      key={state.key}
      className="route-transition"
      data-transition={state.kind === "sheet" ? "none" : previous.current.kind}
      data-back={previous.current.back}
    >
      {children}
    </div>
  );
}
