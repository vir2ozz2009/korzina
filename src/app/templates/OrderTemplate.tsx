import { Children, type ReactNode } from "react";
import { Header } from "../shell/Header";
import { Screen } from "../shell/Screen";
import type { TemplateProps } from "./types";

export function OrderTemplate({
  state,
  title,
  header,
  status,
  sections,
  events,
  actions,
}: Omit<TemplateProps, "children"> & {
  status: ReactNode;
  sections: readonly ReactNode[];
  events?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Screen state={state} template="order" header={header ?? <Header title={title} />} footer={actions}>
      {status}
      {Children.map([...sections], (child) => (
        <div>{child}</div>
      ))}
      {events && <ol className="space-y-3">{events}</ol>}
    </Screen>
  );
}
