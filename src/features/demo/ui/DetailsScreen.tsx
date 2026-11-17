import { useBack } from "../../../app/shell/useBack";
import { FeedbackTemplate } from "../../../app/templates/FeedbackTemplate";
import { Button } from "../../../ui/Button";

export function DetailsScreen() {
  const back = useBack("/p/demo");
  return (
    <FeedbackTemplate
      sheet
      title="Подробнее о товаре"
      body={<p>Спелые томаты на ветке. Храните в прохладном месте. Демо-описание для проверки шторки.</p>}
      actions={
        <Button full onClick={back}>
          Понятно
        </Button>
      }
    />
  );
}
