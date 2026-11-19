import { QrCode } from "lucide-react";
import { useState } from "react";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { Dialog } from "../../../ui/Dialog";
import { TextArea } from "../../../ui/TextArea";
import type { AdminShop } from "../api";
import { useShopCommand } from "./useShopCommand";

export function AdminOwner({ shop }: { shop: AdminShop }) {
  const command = useShopCommand(shop.id);
  const [confirm, setConfirm] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("");
  const [qr, setQr] = useState<{ url: string; image: string }>();
  const { invite } = shop;
  const url = invite.url;
  const shown = qr?.url === url ? qr : undefined;

  function newLink(replacement?: string) {
    command.submit({ action: "invite", version: shop.version, reason: replacement }, () => {
      setStatus(replacement ? "Ссылка для нового владельца выпущена" : "Новая ссылка выпущена");
      setConfirm(false);
      setReplacing(false);
      setReason("");
      setQr(undefined);
    });
  }
  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Ссылка скопирована");
    } catch {
      setStatus("Не удалось скопировать. Выделите ссылку вручную.");
    }
  }
  async function showQr() {
    if (!url || shown) {
      setQr(undefined);
      return;
    }
    try {
      const { default: qrcode } = await import("qrcode-generator");
      const code = qrcode(0, "M");
      code.addData(url);
      code.make();
      setQr({ url, image: code.createDataURL(5, 20) });
    } catch {
      setStatus("Не удалось показать QR-код");
    }
  }

  return (
    <Card>
      <h2 className="text-title-3">Владелец</h2>
      <p className="text-label">{shop.ownerAccepted ? shop.ownerName || "Владелец подтверждён" : "ждём владельца"}</p>
      {invite.replacing && <p className="text-caption">Ждём принятия ссылки новым владельцем</p>}
      <div className="rounded-lg bg-input px-3 py-2">
        <p className="text-small text-muted-foreground">Ссылка-приглашение</p>
        <p className="break-all text-caption">
          {url ??
            (invite.expiresAt && invite.expiresAt <= Date.now() ? "Срок ссылки истёк" : "Приглашение пока недоступно")}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={!url} onClick={() => void copy()}>
          Скопировать
        </Button>
        <Button
          variant="secondary"
          aria-expanded={!!shown}
          disabled={!url}
          icon={<QrCode size={18} />}
          onClick={() => void showQr()}
        >
          QR
        </Button>
        <Button variant="secondary" onClick={() => setConfirm(true)}>
          Новая ссылка
        </Button>
      </div>
      {status && (
        <p role="status" className="text-caption">
          {status}
        </p>
      )}
      {command.error && <p role="alert">{command.error}</p>}
      {shown && <img src={shown.image} alt="QR-код ссылки-приглашения" className="size-44 max-w-full" />}
      {shop.ownerAccepted && (
        <Button variant="ghost" aria-expanded={replacing} onClick={() => setReplacing(!replacing)}>
          Сменить владельца
        </Button>
      )}
      {replacing && (
        <div className="space-y-2">
          <TextArea
            label="Причина смены владельца"
            value={reason}
            maxLength={300}
            onChange={(event) => setReason(event.target.value)}
          />
          <Button full disabled={!reason.trim()} loading={command.pending} onClick={() => newLink(reason.trim())}>
            Выпустить приглашение
          </Button>
        </div>
      )}
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Выпустить новую ссылку?"
        description={command.error ?? "Прежняя ссылка перестанет работать."}
        confirm="Выпустить"
        loading={command.pending}
        onConfirm={() => newLink()}
      />
    </Card>
  );
}
