import { ListTemplate } from "../../../app/templates/ListTemplate";
import { EmptyState } from "../../../ui/EmptyState";

export function AdminScreen() {
  return (
    <ListTemplate title="Платформа Korzina">
      <EmptyState title="Каркас админки" description="Вход и управление магазинами будут подключены в AD1." />
    </ListTemplate>
  );
}
