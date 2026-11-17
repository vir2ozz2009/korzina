import { ErrorState } from "../../ui/ErrorState";
import { Header } from "./Header";
import { Screen } from "./Screen";

export function RouteError({ reset }: { reset: () => void }) {
  return (
    <Screen header={<Header title="Ошибка" />}>
      <ErrorState onRetry={reset} />
    </Screen>
  );
}
