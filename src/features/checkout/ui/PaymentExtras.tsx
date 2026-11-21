import { useState } from "react";
import { useToast } from "../../../app/shell/ToastProvider";
import type { QuoteResponse } from "../../../shared/contracts/checkout";
import { formatMinor } from "../../../shared/money";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { CopyField } from "../../../ui/CopyField";
import { ListItem } from "../../../ui/ListItem";
import { Sheet } from "../../../ui/Sheet";
import { SkeletonBlock } from "../../../ui/SkeletonBlock";

import { useShopContacts } from "../api";

function QrImage({ src, preview = false }: { src: string; preview?: boolean }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className="space-y-2">
      <p role="alert">Не удалось загрузить QR</p>
      <Button variant="secondary" onClick={() => setFailed(false)}>
        Повторить
      </Button>
    </div>
  ) : (
    <img
      src={src}
      alt="QR для перевода"
      onError={() => setFailed(true)}
      className={`max-w-full rounded-lg object-contain ${preview ? "size-36" : "mx-auto max-h-[45dvh]"}`}
    />
  );
}

export function TransferInstruction({
  instruction,
  qrSrc,
  details,
}: {
  instruction?: string;
  qrSrc?: string;
  details?: string;
}) {
  const [qr, setQr] = useState(false);
  const toast = useToast();
  return (
    <div className="space-y-3">
      {qrSrc && (
        <>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <QrImage key={qrSrc} src={qrSrc} preview />
            <Button variant="secondary" onClick={() => setQr(true)}>
              QR крупнее
            </Button>
          </div>
          <Sheet title="QR для перевода" open={qr} onOpenChange={setQr}>
            {qr && (
              <div className="space-y-3">
                <QrImage src={qrSrc} />
                <a
                  href={qrSrc}
                  target="_blank"
                  rel="noreferrer"
                  download
                  className="block py-3 text-center text-label text-primary-strong underline"
                >
                  Сохранить QR
                </a>
              </div>
            )}
          </Sheet>
        </>
      )}
      {details && instruction && <p className="whitespace-pre-wrap text-small">{instruction}</p>}
      {(details || instruction) && (
        <CopyField
          label="Реквизиты для перевода"
          value={details || instruction || ""}
          onCopied={() => toast("Реквизиты скопированы")}
          onError={() => toast("Не удалось скопировать реквизиты")}
        />
      )}
    </div>
  );
}

export function ShopContacts({ enabled }: { enabled: boolean }) {
  const query = useShopContacts(enabled);
  if (query.isPending) return <SkeletonBlock className="h-14" />;
  if (query.isError && !query.data)
    return (
      <div className="space-y-2">
        <p role="alert">Не удалось загрузить контакты</p>
        <Button full variant="secondary" loading={query.isFetching} onClick={() => void query.refetch()}>
          Повторить
        </Button>
      </div>
    );
  if (!query.data?.length) return <p>Контакты магазина пока недоступны</p>;
  return query.data.map((contact) => <ListItem key={contact.href} title={contact.title} href={contact.href} />);
}

export function PaymentHelp() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button full variant="ghost" onClick={() => setOpen(true)}>
        Проблема с оплатой?
      </Button>
      <Sheet title="Помощь с оплатой" open={open} onOpenChange={setOpen}>
        {open && <ShopContacts enabled={open} />}
      </Sheet>
    </>
  );
}

export function QuoteChange({
  old,
  quote,
  hasReceipt,
  methodId,
  accept,
}: {
  old: QuoteResponse;
  quote: QuoteResponse;
  hasReceipt: boolean;
  methodId?: string;
  accept: () => void;
}) {
  const diff = quote.totalMinor - old.totalMinor;
  const before = old.paymentSettings.options?.find(({ id }) => id === methodId);
  const next = quote.paymentSettings.options?.find(({ id }) => id === methodId);
  const changedDetails =
    old.paymentSettings.qrSrc !== quote.paymentSettings.qrSrc ||
    old.paymentSettings.instruction !== quote.paymentSettings.instruction ||
    before?.imageSrc !== next?.imageSrc ||
    before?.details !== next?.details ||
    before?.instruction !== next?.instruction;
  return (
    <Card role="alert">
      <h2 className="text-title-3">Условия заказа изменились</h2>
      {diff !== 0 && (
        <>
          <p>Было {formatMinor(old.totalMinor, old.currency)}</p>
          <p>Стало {formatMinor(quote.totalMinor, quote.currency)}</p>
          {hasReceipt && (
            <p>
              {diff > 0 ? "Доплата" : "Переплата"} {formatMinor(Math.abs(diff), quote.currency)}
            </p>
          )}
        </>
      )}
      {changedDetails && (
        <p>{hasReceipt ? "Магазин проверит перевод по прежним реквизитам" : "Реквизиты изменились"}</p>
      )}
      <Button full onClick={accept}>
        Подтвердить
      </Button>
    </Card>
  );
}
