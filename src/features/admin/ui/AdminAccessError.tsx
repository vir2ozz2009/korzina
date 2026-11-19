import { useNavigate } from "@tanstack/react-router";
import { Send } from "lucide-react";
import { useState } from "react";
import { Button } from "../../../ui/Button";
import { EmptyState } from "../../../ui/EmptyState";
import { ContactSheet, useContact } from "../../contact";
import { useProfile } from "../../profile";
import { useOpenAdmin } from "../api";

export function AdminAccessError({ returnToRegistry }: { returnToRegistry?: boolean }) {
  const contact = useContact();
  const profile = useProfile(contact.data?.telegramLinked === true);
  const access = useOpenAdmin();
  const navigate = useNavigate();
  const [login, setLogin] = useState(false);
  return (
    <>
      {profile.data?.platformAdmin ? (
        <Button
          full
          icon={<Send size={20} />}
          loading={access.isPending}
          onClick={() => access.mutate(undefined, { onError: () => setLogin(true) })}
        >
          Войти через Telegram
        </Button>
      ) : (
        <EmptyState
          title="Нет доступа"
          action={returnToRegistry ? "В админку" : "В профиль"}
          onAction={() =>
            void navigate({
              to: returnToRegistry ? "/admin" : "/profile",
              search: (previous) => ({ shop: previous.shop }),
            })
          }
        />
      )}
      <ContactSheet
        mode={login ? "link" : undefined}
        close={() => {
          setLogin(false);
          access.mutate();
        }}
      />
    </>
  );
}
