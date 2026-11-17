import type { ReactNode } from "react";
import { StickyFooter } from "../../ui/StickyFooter";
import type { TemplateName, TemplateState } from "../templates/types";
import { QueryBoundary } from "./QueryBoundary";

export function Screen({
  header,
  footer,
  children,
  state,
  template = "home",
}: {
  header: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  state?: TemplateState;
  template?: TemplateName;
}) {
  const ready =
    !state || (!state.query.isPending && !(state.query.isError && state.query.data === undefined) && !state.empty);
  return (
    <section className="screen">
      <div className="screen-header">{header}</div>
      <main id="screen-content" className="min-h-0 flex-1 space-y-3 px-(--page-x) py-3">
        {state ? (
          <QueryBoundary
            query={state.query}
            template={template}
            isEmpty={() => !!state.empty}
            emptyAction={state.onEmpty}
          >
            {() => children}
          </QueryBoundary>
        ) : (
          children
        )}
      </main>
      {footer && ready && <StickyFooter>{footer}</StickyFooter>}
    </section>
  );
}
