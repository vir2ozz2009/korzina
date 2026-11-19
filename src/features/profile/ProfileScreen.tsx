import { useNavigate } from "@tanstack/react-router";
import { Heart, LogOut, MapPin, Package, Send, User } from "lucide-react";
import { useState } from "react";
import { Header } from "../../app/shell/Header";
import { QueryBoundary } from "../../app/shell/QueryBoundary";
import { Screen } from "../../app/shell/Screen";
import { Avatar } from "../../ui/Avatar";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { ListItem } from "../../ui/ListItem";
import { Sheet } from "../../ui/Sheet";
import { ContactSheet, useContact } from "../contact";
import { useLogout, useProfile } from "./api";

export function ProfileScreen() {
  const contact = useContact();
  const active = Boolean(contact.data?.phone || contact.data?.telegramLinked);
  const profile = useProfile(active);
  const logout = useLogout();
  const [sheet, setSheet] = useState<"telegram" | "link" | "logout">();
  const navigate = useNavigate();
  const close = () => setSheet(undefined);
  return (
    <Screen template="form" header={<Header title="Профиль" />}>
      <QueryBoundary query={contact} template="form">
        {() =>
          active ? (
            <QueryBoundary query={profile} template="form">
              {(person) => (
                <>
                  <Card className="flex items-center gap-3">
                    <Avatar name={person.name || "Покупатель"} />
                    <div>
                      <h2 className="text-title-2">{person.name || "Имя не указано"}</h2>
                      <p className="text-small text-muted-foreground">
                        {person.telegramLinked ? "Telegram подключён" : "Вошли по номеру на этом устройстве"}
                      </p>
                      {!person.telegramLinked && person.phone && <p>{person.phone}</p>}
                    </div>
                  </Card>
                  <ListItem
                    title="Мои заказы"
                    icon={<Package size={22} />}
                    onClick={() => void navigate({ to: "/orders" })}
                  />
                  <ListItem
                    title="Избранное"
                    icon={<Heart size={22} />}
                    onClick={() => void navigate({ to: "/favorites" })}
                  />
                  <ListItem
                    title="Мои данные"
                    icon={<User size={22} />}
                    onClick={() => void navigate({ to: "/profile/data" })}
                  />
                  <ListItem
                    title="Мои адреса"
                    icon={<MapPin size={22} />}
                    onClick={() => void navigate({ to: "/profile/addresses" })}
                  />
                  {!person.telegramLinked && (
                    <ListItem title="Подключить Telegram" icon={<Send size={22} />} onClick={() => setSheet("link")} />
                  )}
                  <ListItem
                    title="Выйти"
                    icon={<LogOut size={22} />}
                    onClick={() => {
                      logout.reset();
                      setSheet("logout");
                    }}
                  />
                </>
              )}
            </QueryBoundary>
          ) : (
            <>
              <Button full onClick={() => setSheet("telegram")}>
                Войти
              </Button>
              <ListItem
                title="Избранное"
                icon={<Heart size={22} />}
                onClick={() => void navigate({ to: "/favorites" })}
              />
            </>
          )
        }
      </QueryBoundary>
      <ContactSheet mode={sheet === "logout" ? undefined : sheet} close={close} />
      {sheet === "logout" && (
        <Sheet
          open
          title="Выйти из профиля?"
          onOpenChange={(open) => {
            if (!open && !logout.isPending) close();
          }}
        >
          <div className="space-y-2">
            {logout.isError && <p role="alert">Не удалось выйти. {logout.error.message}</p>}
            <Button full loading={logout.isPending} onClick={() => logout.mutate(undefined, { onSuccess: close })}>
              {logout.isError ? "Повторить" : "Выйти"}
            </Button>
            {logout.isPending && <p role="status">Выходим…</p>}
            <Button full variant="secondary" onClick={close} disabled={logout.isPending}>
              Отмена
            </Button>
          </div>
        </Sheet>
      )}
    </Screen>
  );
}
