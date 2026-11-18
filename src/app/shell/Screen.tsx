import type { ReactNode } from "react";
import { errorKind } from "../../shared/http-error";
import { StickyFooter } from "../../ui/StickyFooter";
import type { TemplateName, TemplateState } from "../templates/types";
import { QueryBoundary } from "./QueryBoundary";

export function Screen({
  header,
  footer,
  after,
  children,
  state,
  template = "home",
}: {
  header: ReactNode;
  footer?: ReactNode;
  after?: ReactNode;
  children: ReactNode;
  state?: TemplateState;
  template?: TemplateName;
}) {
  const ready =
    !state ||
    (!state.query.isPending &&
      !(state.query.isError && (state.query.data === undefined || errorKind(state.query.error) === "access")) &&
      !state.empty);
  return (
    <section className="flex min-h-[calc(var(--app-height)_-_var(--safe-top)_-_var(--tab-height)_-_var(--safe-bottom))] flex-col">
      <div className={template === "home" ? "relative z-20" : "sticky top-(--safe-top) z-20"}>{header}</div>
      <main id="screen-content" className={`min-h-0 flex-1 space-y-3 px-(--page-x) pt-3 pb-24`}>
        {state ? (
          <QueryBoundary
            query={state.query}
            template={template}
            isEmpty={() => !!state.empty}
            emptyAction={state.onEmpty}
            emptyTitle={state.emptyTitle}
            emptyDescription={state.emptyDescription}
          >
            {() => children}
          </QueryBoundary>
        ) : (
          children
        )}
        {after}
      </main>
      {footer &&
        ready &&
        (template === "product" ? (
          <div className="pointer-events-none fixed inset-x-3 bottom-(--floating-bottom) z-20 mx-auto max-w-(--content-max) pr-[7.75rem] drop-shadow-[var(--shadow-float)] [&_button]:pointer-events-auto">
            {footer}
          </div>
        ) : (
          <StickyFooter>{footer}</StickyFooter>
        ))}
    </section>
  );
}
