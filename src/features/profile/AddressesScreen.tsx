import { useNavigate } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { useState } from "react";
import { Header } from "../../app/shell/Header";
import { Screen } from "../../app/shell/Screen";
import { savedAddressLimit } from "../../shared/address-key";
import type { SavedAddress } from "../../shared/contracts/profile";
import { errorKind } from "../../shared/http-error";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { ListItem } from "../../ui/ListItem";
import { AddressEditor } from "./AddressEditor";
import { useAddresses } from "./api";

export function AddressesScreen() {
  const addresses = useAddresses();
  const [editor, setEditor] = useState<SavedAddress | "new">();
  const navigate = useNavigate();
  const header = <Header title={editor ? "Адрес доставки" : "Мои адреса"} />;
  if (addresses.isError && errorKind(addresses.error) === "access")
    return (
      <Screen template="list" header={header}>
        <EmptyState title="Войдите в магазин" action="Войти" onAction={() => void navigate({ to: "/profile" })} />
      </Screen>
    );
  return (
    <Screen template={editor ? "form" : "list"} header={header} state={{ query: addresses }}>
      {editor ? (
        <AddressEditor initial={editor === "new" ? undefined : editor} close={() => setEditor(undefined)} />
      ) : (
        <>
          {addresses.data?.addresses.map((item) => (
            <ListItem
              key={item.id}
              title={item.title || item.address}
              subtitle={[item.title && item.address, item.apartment && `кв. ${item.apartment}`]
                .filter(Boolean)
                .join(" · ")}
              icon={<MapPin size={22} />}
              onClick={() => setEditor(item)}
            />
          ))}
          {addresses.data?.addresses.length === 0 && <EmptyState title="Сохранённых адресов нет" icon={<MapPin />} />}
          {(addresses.data?.addresses.length ?? 0) >= savedAddressLimit && <p role="status">Достигнут лимит адресов</p>}
          <Button
            full
            disabled={addresses.isError || (addresses.data?.addresses.length ?? 0) >= savedAddressLimit}
            onClick={() => setEditor("new")}
          >
            Добавить адрес
          </Button>
        </>
      )}
    </Screen>
  );
}
