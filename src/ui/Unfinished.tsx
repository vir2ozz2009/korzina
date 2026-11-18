import type { ReactNode } from "react";

export function Unfinished({
  task,
  notify,
  children,
}: {
  task: string;
  notify: (message: string) => void;
  children: (onClick: () => void) => ReactNode;
}) {
  return import.meta.env.SHOW_UNFINISHED ? children(() => notify(`В работе · ${task}`)) : null;
}
