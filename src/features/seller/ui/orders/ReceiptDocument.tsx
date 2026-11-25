import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ReceiptRef } from "../../../../shared/contracts/seller-order";
import { Button } from "../../../../ui/Button";
import { sellerReceiptFile } from "../../orders-api";

export function ReceiptDocument({
  store,
  number,
  receipt,
  refund = false,
}: {
  store: string;
  number: number;
  receipt: ReceiptRef;
  refund?: boolean;
}) {
  const file = useQuery({
    queryKey: ["seller-orders", store, refund ? "refund" : "receipt", number, receipt.id],
    queryFn: ({ signal }) => sellerReceiptFile(store, number, receipt.id, signal, refund ? "refund" : "receipts"),
    gcTime: 0,
    retry: false,
  });
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!file.data) return;
    const source = URL.createObjectURL(file.data);
    setUrl(source);
    return () => URL.revokeObjectURL(source);
  }, [file.data]);
  if (file.error)
    return (
      <>
        <p role="alert">{file.error.message}</p>
        <Button variant="secondary" onClick={() => void file.refetch()}>
          Повторить
        </Button>
      </>
    );
  if (!url) return <p role="status">{refund ? "Загружаем QR…" : "Загружаем чек…"}</p>;
  if (receipt.mime === "application/pdf")
    return (
      <>
        <object
          data={url}
          type="application/pdf"
          aria-label="Документ чека"
          className="min-h-72 w-full rounded-lg bg-secondary"
        >
          <p>PDF-документ</p>
        </object>
        <a href={url} target="_blank" rel="noreferrer" className="flex min-h-11 items-center text-primary-text">
          Открыть PDF
        </a>
      </>
    );
  return (
    <img
      src={url}
      alt={refund ? "QR для возврата" : "Документ чека"}
      className="max-h-[60dvh] w-full rounded-lg object-contain"
    />
  );
}
