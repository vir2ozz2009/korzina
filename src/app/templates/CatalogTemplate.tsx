import type { ReactNode } from "react";
import { Button } from "../../ui/Button";
import { Header } from "../shell/Header";
import { Screen } from "../shell/Screen";
import type { TemplateProps } from "./types";

export function CatalogTemplate({
  state,
  title,
  header,
  toolbar,
  children,
  footer,
  layout = "grid",
  onLoadMore,
  loadingMore,
}: TemplateProps & {
  toolbar?: ReactNode;
  layout?: "grid" | "list";
  onLoadMore?: () => void;
  loadingMore?: boolean;
}) {
  return (
    <Screen state={state} template="catalog" header={header ?? <Header title={title} />} footer={footer}>
      {toolbar && <div className="overflow-x-auto py-2">{toolbar}</div>}
      <div className={layout === "grid" ? "grid grid-cols-2 gap-2" : "space-y-3"}>{children}</div>
      {onLoadMore && (
        <Button full variant="secondary" loading={loadingMore} onClick={onLoadMore}>
          Показать ещё
        </Button>
      )}
    </Screen>
  );
}
