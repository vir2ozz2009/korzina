import { useNavigate } from "@tanstack/react-router";
import { Heart, Package } from "lucide-react";
import { useState } from "react";
import { Header } from "../../app/shell/Header";
import { Screen } from "../../app/shell/Screen";
import { Button } from "../../ui/Button";
import { ListItem } from "../../ui/ListItem";
import { ContactSheet, useContact } from "../contact";

export function ProfileScreen() {
  const contact = useContact();
  const [login, setLogin] = useState(false);
  const navigate = useNavigate();
  const active = contact.data?.phone || contact.data?.telegramLinked;
  return (
    <Screen template="form" header={<Header title="Профиль" />}>
      {!active && (
        <Button full onClick={() => setLogin(true)}>
          Войти
        </Button>
      )}
      {active && (
        <ListItem title="Мои заказы" icon={<Package size={22} />} onClick={() => void navigate({ to: "/orders" })} />
      )}
      <ListItem title="Избранное" icon={<Heart size={22} />} onClick={() => void navigate({ to: "/favorites" })} />
      <ContactSheet mode={login ? "telegram" : undefined} close={() => setLogin(false)} />
    </Screen>
  );
}
