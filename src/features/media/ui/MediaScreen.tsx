import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Header } from "../../../app/shell/Header";
import { Screen } from "../../../app/shell/Screen";
import type { MediaPurpose } from "../../../shared/contracts/media";
import { Card } from "../../../ui/Card";
import { Select } from "../../../ui/Select";
import { usageQuery } from "../api";
import { MediaUploads } from "./MediaUploads";

export function MediaScreen() {
  const seller = new URLSearchParams(location.search).get("as") === "seller";
  const [purpose, setPurpose] = useState<MediaPurpose>(seller ? "product" : "receipt");
  const usage = useQuery({ ...usageQuery(), enabled: seller });
  return (
    <Screen header={<Header title="Фото и файлы" />} template="form" state={seller ? { query: usage } : undefined}>
      <Card>
        <Select
          label="Назначение"
          value={purpose}
          onChange={(value) => setPurpose(value as MediaPurpose)}
          options={
            seller
              ? [
                  { value: "product", label: "Товар или категория" },
                  { value: "logo", label: "Логотип" },
                  { value: "cover", label: "Обложка" },
                  { value: "payment_qr", label: "QR оплаты" },
                ]
              : [
                  { value: "receipt", label: "Чек" },
                  { value: "chat", label: "Вложение в чат" },
                  { value: "review", label: "Фото отзыва" },
                  { value: "refund", label: "Возврат" },
                ]
          }
        />
      </Card>
      {seller && usage.data && (
        <Card>
          <p>
            Занято {(usage.data.used / 1024 ** 2).toLocaleString("ru", { maximumFractionDigits: 1 })} МБ /{" "}
            {(usage.data.limit / 1024 ** 3).toLocaleString("ru")} ГБ
          </p>
        </Card>
      )}
      <MediaUploads key={purpose} seller={seller} purpose={purpose} />
    </Screen>
  );
}
