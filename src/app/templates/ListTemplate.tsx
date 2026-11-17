import type { ReactNode } from "react";
import { Button } from "../../ui/Button";
import { Header } from "../shell/Header";
import { Screen } from "../shell/Screen";
import type { TemplateProps } from "./types";

export function ListTemplate({
  state,
  title,
  header,
  tabs,
  filters,
  children,
  footer,
  onLoadMore,
  loadingMore,
}: TemplateProps & {
  tabs?: ReactNode;
  filters?: ReactNode;
  onLoadMore?: () => void;
  loadingMore?: boolean;
}) {
  return (
    <Screen state={state} template="list" header={header ?? <Header title={title} />} footer={footer}>
      {tabs}
      {filters}
      <div className="space-y-3">{children}</div>
      {onLoadMore && (
        <Button full variant="secondary" loading={loadingMore} onClick={onLoadMore}>
          Показать ещё
        </Button>
      )}
    </Screen>
  );
}
