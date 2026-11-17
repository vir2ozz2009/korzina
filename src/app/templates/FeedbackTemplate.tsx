import type { ReactNode } from "react";
import { Header } from "../shell/Header";
import { Screen } from "../shell/Screen";
import { SheetRoute } from "../shell/SheetRoute";
import type { TemplateState } from "./types";

export function FeedbackTemplate({
  state,
  title,
  body,
  actions,
  sheet = false,
}: {
  state?: TemplateState;
  title: string;
  body: ReactNode;
  actions: ReactNode;
  sheet?: boolean;
}) {
  const content = (
    <div className="space-y-4">
      {body}
      {sheet && actions}
    </div>
  );
  if (sheet) return <SheetRoute title={title}>{content}</SheetRoute>;
  return (
    <Screen state={state} template="feedback" header={<Header title={title} />} footer={actions}>
      {content}
    </Screen>
  );
}
