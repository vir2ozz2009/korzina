import { useState } from "react";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { Dialog } from "../../../ui/Dialog";
import { Input } from "../../../ui/Input";
import { type AdminShop, useBotChange } from "../api";

export function AdminShopBot({ shop }: { shop: AdminShop }) {
  const change = useBotChange(shop.id);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [token, setToken] = useState("");
  const [pending, setPending] = useState<"connect" | "disconnect">();
  const [error, setError] = useState("");

  async function submit(action: "connect" | "disconnect") {
    if (pending) return;
    const secret = token.trim();
    if (action === "connect" && !secret) return;
    setPending(action);
    setError("");
    setToken("");
    try {
      await change(
        action === "connect" ? { action, version: shop.version, token: secret } : { action, version: shop.version },
      );
      setEditing(false);
      setConfirm(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось настроить бота");
    } finally {
      setPending(undefined);
    }
  }
  return (
    <Card>
      <h2 className="text-title-3">Бот магазина</h2>
      <p role="status" className="text-caption">
        {shop.botUsername ? `Бот подключён · @${shop.botUsername}` : "Бот не подключён"}
      </p>
      {!shop.botUsername || editing ? (
        <form
          aria-label="Подключение бота"
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submit("connect");
          }}
        >
          <Input
            label="Токен из BotFather"
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            value={token}
            disabled={!!pending}
            error={error || undefined}
            onChange={(event) => {
              setToken(event.target.value);
              setError("");
            }}
          />
          <Button full type="submit" loading={pending === "connect"} disabled={!token.trim()}>
            {pending === "connect" ? "Проверяем токен" : "Подключить"}
          </Button>
          {pending === "connect" && (
            <p role="status" className="text-caption">
              Проверяем токен
            </p>
          )}
          {editing && (
            <Button
              variant="ghost"
              disabled={!!pending}
              onClick={() => {
                setToken("");
                setError("");
                setEditing(false);
              }}
            >
              Отмена
            </Button>
          )}
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Сменить токен
          </Button>
          <Button variant="secondary" onClick={() => setConfirm(true)}>
            Отключить
          </Button>
        </div>
      )}
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Отключить бота?"
        description={error || "Витрина продолжит работать как сайт."}
        confirm="Отключить"
        loading={pending === "disconnect"}
        onConfirm={() => void submit("disconnect")}
      />
    </Card>
  );
}
