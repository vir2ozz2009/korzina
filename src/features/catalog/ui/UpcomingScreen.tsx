import { useRouterState } from "@tanstack/react-router";
import { useBack } from "../../../app/shell/useBack";
import { FeedbackTemplate } from "../../../app/templates/FeedbackTemplate";
import { Button } from "../../../ui/Button";
import { EmptyState } from "../../../ui/EmptyState";

export function UpcomingScreen() {
  const title = useRouterState({ select: (state) => state.matches.at(-1)?.staticData.title ?? "Магазин" });
  const back = useBack();
  return (
    <FeedbackTemplate
      title={title}
      body={<EmptyState title="Скоро здесь появятся товары" description="Пока выбирайте товары на главной магазина." />}
      actions={
        <Button full onClick={back}>
          Вернуться к товарам
        </Button>
      }
    />
  );
}
