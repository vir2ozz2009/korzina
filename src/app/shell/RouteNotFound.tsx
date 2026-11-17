import { EmptyState } from "../../ui/EmptyState";
import { Header } from "./Header";
import { Screen } from "./Screen";

export function RouteNotFound() {
  return (
    <Screen header={<Header title="Страница не найдена" />}>
      <EmptyState
        title="Такой страницы нет"
        action="На главную"
        onAction={() => {
          location.href = "/";
        }}
      />
    </Screen>
  );
}
