import { Children, type ReactNode } from "react";
import { Button } from "../../ui/Button";
import { Header } from "../shell/Header";
import { Screen } from "../shell/Screen";
import type { TemplateProps } from "./types";

export function CheckoutTemplate({
  state,
  title,
  header,
  sections,
  summary,
  cta,
  submitting,
  onSubmit,
  quoteChanged,
}: Omit<TemplateProps, "children"> & {
  sections: readonly ReactNode[];
  summary: ReactNode;
  cta: string;
  submitting?: boolean;
  onSubmit?: () => void;
  quoteChanged?: ReactNode;
}) {
  return (
    <Screen
      state={state}
      template="checkout"
      header={header ?? <Header title={title} />}
      footer={
        <div className="space-y-3">
          {summary}
          <Button full size="xl" loading={submitting} disabled={!onSubmit} onClick={onSubmit}>
            {cta}
          </Button>
        </div>
      }
    >
      {quoteChanged}
      {Children.map([...sections], (child) => (
        <div>{child}</div>
      ))}
    </Screen>
  );
}
