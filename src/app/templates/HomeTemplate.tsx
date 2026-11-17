import { Children, type ReactNode, useRef } from "react";
import { Button } from "../../ui/Button";
import { Header } from "../shell/Header";
import { Screen } from "../shell/Screen";
import type { TemplateProps } from "./types";

export function HomeTemplate({
  state,
  title,
  header,
  sections,
  onRefresh,
  refreshing,
  footer,
  after,
}: Omit<TemplateProps, "children"> & {
  sections: readonly ReactNode[];
  onRefresh?: () => void;
  refreshing?: boolean;
  after?: ReactNode;
}) {
  const touchY = useRef<number | null>(null);
  return (
    <Screen state={state} template="home" header={header ?? <Header title={title} />} footer={footer} after={after}>
      <div
        onTouchStart={(event) => {
          touchY.current = window.scrollY === 0 ? (event.touches[0]?.clientY ?? null) : null;
        }}
        onTouchEnd={(event) => {
          if (touchY.current !== null && (event.changedTouches[0]?.clientY ?? 0) - touchY.current > 80 && !refreshing)
            onRefresh?.();
          touchY.current = null;
        }}
        className="space-y-3"
      >
        {onRefresh && (
          <Button variant="ghost" loading={refreshing} onClick={onRefresh}>
            Обновить
          </Button>
        )}
        {Children.map([...sections], (child) => (
          <div>{child}</div>
        ))}
      </div>
    </Screen>
  );
}
