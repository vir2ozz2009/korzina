import { Button } from "../../../ui/Button";
import { ListItem } from "../../../ui/ListItem";
import { Sheet } from "../../../ui/Sheet";
import { useShopContacts } from "../../checkout";

export function OrderContactsSheet({ close }: { close: () => void }) {
  const contacts = useShopContacts(true);
  return (
    <Sheet
      open
      title="Связь с магазином"
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      {contacts.isPending && <p role="status">Загружаем контакты…</p>}
      {contacts.isError && <Button onClick={() => void contacts.refetch()}>Повторить</Button>}
      {contacts.data?.length === 0 && <p>Контакты магазина пока не указаны</p>}
      {contacts.data?.map(({ title, href }) => (
        <ListItem key={href} title={title} href={href} />
      ))}
    </Sheet>
  );
}
